// ==================================================================
// ===== SUITE: encounter bar readouts and their motion =============
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste utilities/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-menubar.md
// Architecture: documentation/architecture/architecture-menubar.md,
//               documentation/architecture/architecture-encounter.md
// Implementation: scripts/api-menubar.js, scripts/manager-combatbar.js
//
// WHY THIS SUITE EXISTS
//
// The readout motion cannot be verified by reading the code, and it cannot
// be verified by playing either: a flash fires when a number changes, and
// making a number change on the encounter bar means rolling dice until the
// right one moves. So it went unverified, and when it did not appear there
// was no way to tell WHICH link had failed — the value never reached the
// DOM, the DOM never got the class, the class had no rule, or the rule was
// suppressed by a motion preference.
//
// Every check here isolates one of those links. The interactive triggers
// push a value directly, which is safe: `updateSecondaryBarItemInfo` only
// changes what is displayed, and the next `refreshReadoutItems` overwrites
// it with the real figure. Nothing here writes to a flag, an actor, or a
// setting.
//
// THE DIAGNOSTIC THAT MATTERS is "did the node survive". Motion is only
// possible because the value-patch path leaves the element in place; if a
// push rebuilds the bar instead, every animation is correctly absent and no
// amount of CSS will fix it. That check tells the two failures apart.
// ==================================================================

import { requireApi, settingRow, stylesheetContains } from './harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/** The bar these readouts live on. */
const BAR = 'combat';

/**
 * A statistic that is visible in the current combat state.
 *
 * The two sets are mutually exclusive by `visible` predicate, so poking the
 * wrong one writes to an item that is not rendered and the check reports a
 * missing element rather than a missing animation — a false failure that
 * would send the next reader after the wrong bug.
 */
function subjectChip() {
    const inCombat = !!(game.combat?.started);
    return inCombat
        ? { itemId: 'stat-damage-dealt', label: 'Damage (live)' }
        : { itemId: 'stat-total-damage', label: 'Damage Dealt (lifetime)' };
}

function chipElement(itemId) {
    return document.querySelector(
        `.combat-data-row .secondary-bar-item[data-item-id="${itemId}"]`
    );
}

function valueElement(itemId) {
    return chipElement(itemId)?.querySelector('.secondary-bar-item-value') ?? null;
}

/** A portrait chip that is currently rendered, whichever set is showing. */
function subjectPortrait() {
    for (const itemId of ['stat-combat-biggest', 'stat-biggest-hitter', 'stat-most-hits', 'stat-most-fumbles']) {
        if (chipElement(itemId)) return itemId;
    }
    return null;
}

/** Let a pushed value reach the DOM. The patch is synchronous; a render is not. */
const settle = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));

/** Longer wait, for anything that needs the 50ms render debounce to fire. */
const settleRender = () => new Promise((resolve) => setTimeout(resolve, 160));

/**
 * Put a throwaway chip on the bar, wait for it to render, and schedule its own removal.
 *
 * The motion triggers used to poke whichever real chip happened to be on the bar, which stopped
 * working the moment a readout with nothing to report stopped being rendered: in a world that has
 * not had a fight yet there is no record chip and no standing chip, so the trigger reported a
 * missing element and the person clicking it saw nothing. Reporting a skip would have been just as
 * useless — these exist so a person can watch an animation, and telling them to come back after a
 * combat is how the motion went unwatched long enough to ship broken twice.
 *
 * The probe is registered with `order: 99` so it lands at the end of the row and displaces nothing,
 * and it removes itself on a timer rather than at the end of this function, because the whole point
 * is that it stays long enough to be seen.
 *
 * @param {object} api - the menubar API, already checked by `requireApi`
 * @param {object} config - item config, minus the placement fields this sets
 * @param {number} lifetimeMs - how long it stays before removing itself
 * @returns {Promise<string|null>} the probe's item id, or null if it never rendered
 */
async function withProbe(api, config, lifetimeMs) {
    const probeId = `harness-probe-${config.kind}`;
    api.registerSecondaryBarItem(BAR, probeId, {
        zone: 'middle',
        group: 'stats',
        order: 99,
        ...config
    });
    // The entrance animation is allowed to finish first, so the burst or the fade reads as its own
    // event rather than as part of the chip arriving.
    await settleRender();
    await settle();
    setTimeout(() => {
        try {
            api.unregisterSecondaryBarItem(BAR, probeId);
        } catch (_) { /* the bar may have closed or re-rendered; nothing to clean up */ }
    }, lifetimeMs);
    return chipElement(probeId) ? probeId : null;
}

/**
 * The gated statistics, paired with the figure that decides whether they appear.
 *
 * Kept here rather than derived, deliberately: this is the harness's own statement of what the bar
 * promises, and a check that read the same predicate the code does would agree with any bug in it.
 * The reading is taken from the public API, the way a consumer would.
 */
function gatedStatistics() {
    let running = null;
    let lifetime = null;
    try {
        const stats = game.modules.get(MODULE_ID)?.api?.stats;
        running = stats?.combat?.getRunningStats() ?? null;
        lifetime = stats?.party?.getAggregateSync() ?? null;
    } catch (_) { /* treated as no data below */ }

    const inCombat = !!(game.combat?.started);
    const n = (value) => (Number(value) || 0) > 0;

    return inCombat
        ? [
            ['stat-damage-dealt', n(running?.totals?.damageDealt)],
            ['stat-kills', n(running?.totals?.kills)],
            ['stat-damage-taken', n(running?.totals?.damageTaken)],
            ['stat-healing-given', n(running?.totals?.healingGiven)],
            ['stat-hit-rate', n(running?.totals?.hits) || n(running?.totals?.misses)],
            ['stat-combat-biggest', n(running?.notableMoments?.biggestHit?.amount)],
            ['stat-combat-mvp', !!running?.notableMoments?.mvp?.name]
        ]
        : [
            ['stat-biggest-hitter', n(lifetime?.biggestHit?.amount)],
            ['stat-most-fumbles', n(lifetime?.mostFumbles?.count)],
            ['stat-most-hits', n(lifetime?.mostHits?.count)],
            ['stat-most-misses', n(lifetime?.mostMisses?.count)],
            ['stat-finesse', n(lifetime?.totalCriticals) || n(lifetime?.totalFumbles)],
            ['stat-total-healing', n(lifetime?.totalHealsGiven)],
            ['stat-total-damage', n(lifetime?.totalDamageGiven)],
            ['stat-total-kills', n(lifetime?.totalKills)],
            ['stat-combats', n(lifetime?.totalCombats)],
            ['stat-avg-hit-rate', n(lifetime?.totalCombats)],
            ['stat-top-mvp', !!lifetime?.topMvp?.name]
        ];
}

export default {
    id: 'readouts',
    label: 'Readouts',
    icon: 'fa-solid fa-chart-line',

    settings: () => {
        const api = game.modules.get(MODULE_ID)?.api;
        const subject = subjectChip();
        const barOpen = !!document.querySelector('.combat-data-row');
        return [
            settingRow('Combat bar open', barOpen ? 'yes' : 'NO — open it, nothing here can run',
                'every check below reads the rendered row'),
            settingRow('Combat running', game.combat?.started ? `yes (round ${game.combat.round})` : 'no',
                'decides which statistics set is rendered, and so which chip the checks poke'),
            settingRow('Subject chip', `${subject.label} (${subject.itemId})`),
            settingRow('Subject rendered', chipElement(subject.itemId) ? 'yes' : 'MISSING',
                'a suppressed or hidden chip cannot animate, and that is correct behaviour'),
            settingRow('Widget stylesheet loaded',
                stylesheetContains('secondary-bar-item-statchip') ? 'yes' : 'MISSING',
                'menubar-widgets.css needs an @import in default.css or it is silently unstyled'),
            settingRow('Motion rules present',
                stylesheetContains('blacksmith-value-flash') ? 'yes' : 'MISSING'),
            settingRow('updateSecondaryBarItemInfo',
                typeof api?.updateSecondaryBarItemInfo === 'function' ? 'available' : 'MISSING')
        ];
    },

    checks: [
        {
            id: 'motion-rules',
            group: 'Motion',
            tier: 'headless',
            label: 'Motion: every animation has a rule that reached the browser',
            note: 'Catches the silent failure where a new stylesheet has no @import and nothing is styled.',
            run: async ({ expect }) => {
                expect.ok('widget styles are loaded at all',
                    stylesheetContains('secondary-bar-item-statchip'));
                expect.ok('value flash keyframes are present',
                    stylesheetContains('blacksmith-value-flash'));
                expect.ok('portrait swap keyframes are present',
                    stylesheetContains('blacksmith-portrait-swap'));
                expect.ok('record burst keyframes are present',
                    stylesheetContains('blacksmith-record-burst'));
                expect.ok('burst punch keyframes are present (the common tier)',
                    stylesheetContains('blacksmith-record-punch'));
                expect.ok('record-tier punch keyframes are present',
                    stylesheetContains('blacksmith-record-punch-big'));
                expect.ok('item entrance keyframes are present',
                    stylesheetContains('blacksmith-item-enter'));
            }
        },

        {
            id: 'patch-path',
            group: 'Motion',
            tier: 'headless',
            label: 'Motion: a pushed value patches the node rather than rebuilding it',
            note: 'THE check to read first when nothing animates. A rebuilt node cannot animate, '
                + 'because the element carrying the previous value is gone — and that is a different '
                + 'bug from a missing CSS rule, with a different fix.',
            run: async ({ expect }) => {
                const api = requireApi('updateSecondaryBarItemInfo');
                const { itemId } = subjectChip();
                const before = valueElement(itemId);
                if (!expect.ok(`${itemId} is rendered`, !!before)) return;

                // Tag the live node. If the same object is still in the document after a push, the
                // value was written in place; if it is gone, the bar was rebuilt around it.
                const token = `probe-${Date.now()}`;
                before.dataset.harnessProbe = token;
                const original = before.textContent;

                api.updateSecondaryBarItemInfo(BAR, itemId, { value: String(Number(original.replace(/\D/g, '') || 0) + 7) });
                await settle();

                const after = valueElement(itemId);
                expect.ok('the value element still exists', !!after);
                expect.ok('the node survived the update (patched, not rebuilt)',
                    after?.dataset?.harnessProbe === token);
                expect.ok('the text actually changed', after?.textContent !== original);

                // Put the real figure back rather than leaving a fabricated one on the bar.
                api.updateSecondaryBarItemInfo(BAR, itemId, { value: original });
            }
        },

        {
            id: 'flash-class',
            group: 'Motion',
            tier: 'headless',
            label: 'Motion: a changed value receives the flash class',
            note: 'Isolates the JS half. If this passes and nothing is visible, the fault is in CSS '
                + 'or in a motion preference, not in the change detection.',
            run: async ({ expect }) => {
                const api = requireApi('updateSecondaryBarItemInfo');
                const { itemId } = subjectChip();
                const node = valueElement(itemId);
                if (!expect.ok(`${itemId} is rendered`, !!node)) return;

                const original = node.textContent;
                node.classList.remove('is-changed');
                api.updateSecondaryBarItemInfo(BAR, itemId, { value: `${Number(original.replace(/\D/g, '') || 0) + 3}` });
                await settle();

                const after = valueElement(itemId);
                expect.ok('the value carries is-changed after a real change',
                    !!after?.classList?.contains('is-changed'));

                // Same reasoning as the entrance check: the class is only half the claim.
                const flash = after ? getComputedStyle(after).animationName : '';
                expect.ok('the changed class resolves to a live animation, not just a class',
                    !!flash && flash !== 'none');

                // An identical push must NOT re-announce: motion follows a value, not a render.
                after?.classList?.remove('is-changed');
                api.updateSecondaryBarItemInfo(BAR, itemId, { value: after?.textContent });
                await settle();
                expect.ok('an unchanged value does not flash',
                    !valueElement(itemId)?.classList?.contains('is-changed'));

                api.updateSecondaryBarItemInfo(BAR, itemId, { value: original });
            }
        },

        {
            id: 'empty-state',
            group: 'Empty state',
            tier: 'headless',
            label: 'Empty state: a statistic is on the bar exactly when it has something to report',
            note: 'Runs against whatever this world currently holds, so it means something in a fresh '
                + 'world and in a long campaign. A chip present with no data is clutter; a chip absent '
                + 'with data is a readout that silently stopped working.',
            run: async ({ expect }) => {
                if (!expect.ok('the combat bar is open', !!document.querySelector('.combat-data-row'))) return;

                const gated = gatedStatistics();
                expect.ok('there are gated statistics for this combat state', gated.length > 0);

                for (const [itemId, hasData] of gated) {
                    const element = chipElement(itemId);
                    // Suppression is a different mechanism and a legitimate reason to be absent, so a
                    // chip missing for want of ROOM must not read as a gating failure.
                    const suppressed = !!element?.classList?.contains('is-suppressed');
                    if (!hasData) {
                        expect.ok(`${itemId}: no data, so not rendered`, !element);
                    } else if (suppressed) {
                        expect.ok(`${itemId}: has data, present but suppressed for width (not a failure)`, true);
                    } else {
                        expect.ok(`${itemId}: has data, so rendered`, !!element);
                    }
                }
            }
        },

        {
            id: 'enter-animation',
            group: 'Empty state',
            tier: 'headless',
            label: 'Empty state: an item that appears is marked as entering',
            note: 'Registers a throwaway item on the combat bar, checks it was marked as new, then '
                + 'removes it. Exercises the real appearance path rather than a simulation of it.',
            run: async ({ expect }) => {
                const api = requireApi('registerSecondaryBarItem', 'unregisterSecondaryBarItem');
                if (!expect.ok('the combat bar is open', !!document.querySelector('.combat-data-row'))) return;
                const probeId = 'harness-enter-probe';
                try {
                    api.registerSecondaryBarItem(BAR, probeId, {
                        kind: 'statchip',
                        zone: 'middle',
                        group: 'stats',
                        order: 99,
                        label: 'Probe',
                        value: '1',
                        tooltip: 'Harness probe - removes itself'
                    });
                    await settleRender();

                    const element = chipElement(probeId);
                    expect.ok('the new item rendered', !!element);
                    expect.ok('the new item was marked as entering',
                        !!element?.classList?.contains('is-entering'));

                    // The class being present is NOT the same as the animation being live, and the
                    // difference is invisible from outside: a rule that stops matching leaves the
                    // class applied and nothing moving, which reads exactly like working code.
                    // That has already happened twice here -- a wrapper selector that repeated the
                    // parent class so every descendant rule doubled it and matched nothing, and a
                    // `@keyframes` left nested inside a style rule, where it is invalid and simply
                    // dropped. Checking the keyframes exist catches neither. Checking the computed
                    // animation catches both.
                    const animation = element ? getComputedStyle(element).animationName : '';
                    expect.ok('the entering class resolves to a live animation, not just a class',
                        !!animation && animation !== 'none');

                    // Anything already on the bar must NOT be marked: an arrival is one item, and
                    // marking the whole row would make the signal meaningless.
                    const neighbour = chipElement(subjectChip().itemId);
                    if (neighbour) {
                        expect.ok('an item that was already there is not marked',
                            !neighbour.classList.contains('is-entering'));
                    }
                } finally {
                    api.unregisterSecondaryBarItem(BAR, probeId);
                    await settleRender();
                    expect.ok('the probe removed itself', !chipElement(probeId));
                }
            }
        },

        {
            id: 'trigger-enter',
            group: 'Empty state',
            tier: 'interactive',
            label: 'Trigger: watch a readout appear',
            note: 'Adds a chip to the row for two seconds and takes it away again. Watch it fade and '
                + 'lift in without the chips beside it sliding.',
            run: async ({ expect }) => {
                const api = requireApi('registerSecondaryBarItem', 'unregisterSecondaryBarItem');
                const probeId = 'harness-enter-demo';
                api.registerSecondaryBarItem(BAR, probeId, {
                    kind: 'statchip',
                    tone: 'record',
                    zone: 'middle',
                    group: 'stats',
                    order: 99,
                    label: 'New',
                    value: '1',
                    tooltip: 'Harness demonstration - removes itself'
                });
                expect.ok('added a chip; it disappears again in two seconds', true);
                setTimeout(() => api.unregisterSecondaryBarItem(BAR, probeId), 2000);
            }
        },

        {
            id: 'trigger-flash',
            group: 'Motion',
            tier: 'interactive',
            label: 'Trigger: flash and count-up on the visible damage chip',
            note: 'Pushes a display-only value; the next refresh restores the real one. '
                + 'Watch for the number climbing rather than jumping, and a brief brightening.',
            run: async ({ expect }) => {
                const api = requireApi('updateSecondaryBarItemInfo');
                const { itemId, label } = subjectChip();
                const node = valueElement(itemId);
                if (!expect.ok(`${label} is rendered`, !!node)) return;

                const original = node.textContent;
                const base = Number(original.replace(/\D/g, '')) || 0;
                // Large enough that a count-up is unmistakable from a swap.
                api.updateSecondaryBarItemInfo(BAR, itemId, { value: String(base + 137) });
                expect.ok(`pushed ${base} -> ${base + 137} on ${label}; the real figure returns on the next refresh`, true);
            }
        },

        {
            id: 'trigger-burst',
            group: 'Motion',
            tier: 'interactive',
            label: 'Trigger: the record burst',
            note: 'The one animation a caller has to declare — the menubar cannot know a standing '
                + 'record was beaten, because the record lives in a different statistics tier.',
            run: async ({ expect }) => {
                const api = requireApi('updateSecondaryBarItemInfo', 'registerSecondaryBarItem', 'unregisterSecondaryBarItem');
                const real = ['stat-combat-biggest', 'stat-biggest-hitter'].find((id) => chipElement(id));

                // A record chip only exists once someone has set a record, so in a world that has
                // not yet had a fight there is nothing to burst. Skipping would be the wrong answer:
                // this trigger exists so a person can SEE the animation, and "come back after a
                // combat" is how it went unwatched long enough to ship broken. So it brings its own
                // chip when the bar has none.
                const itemId = real ?? await withProbe(api, {
                    kind: 'statchip',
                    tone: 'record',
                    label: 'Record',
                    value: '137',
                    tooltip: 'Harness demonstration - removes itself'
                }, 3000);
                if (!expect.ok('a chip to burst (a real record chip, or a demonstration one)', !!itemId)) return;

                // Both tiers, one after the other, because the whole point of having two is that
                // they are told apart at a glance — and that can only be judged by seeing them
                // back to back. The common one first, so the record reads as the escalation.
                api.updateSecondaryBarItemInfo(BAR, itemId, { burst: true });
                expect.ok(`new-best burst on ${itemId} — one ring and a punch`, true);

                setTimeout(() => {
                    api.updateSecondaryBarItemInfo(BAR, itemId, { burst: 'record' });
                }, 1200);
                expect.ok('record burst follows in about a second — expect it to be unmistakably '
                    + 'bigger: two rings, a harder punch, and a glow on the chip', true);
            }
        },

        {
            id: 'trigger-portrait',
            group: 'Motion',
            tier: 'interactive',
            label: 'Trigger: the portrait crossfade',
            note: 'Swaps a standing to another party portrait so the fade is visible. The real face '
                + 'returns on the next refresh.',
            run: async ({ expect }) => {
                const api = requireApi('updateSecondaryBarItemInfo', 'registerSecondaryBarItem', 'unregisterSecondaryBarItem');

                // The crossfade needs two faces, so the portraits are gathered before deciding what
                // to swap: with fewer than two there is nothing to demonstrate on a real chip or a
                // demonstration one, and that is worth saying plainly rather than failing on the chip.
                const portraits = game.actors
                    .filter((actor) => actor.hasPlayerOwner && actor.img)
                    .map((actor) => actor.img);
                const unique = [...new Set(portraits)];
                if (!expect.ok('at least two party portraits exist to fade between', unique.length >= 2)) return;

                // Same reasoning as the burst trigger: a standing chip only exists once someone holds
                // the standing, so this brings its own when the bar has none.
                const real = subjectPortrait();
                const itemId = real ?? await withProbe(api, {
                    kind: 'portraitstat',
                    rank: 1,
                    label: 'Standing',
                    value: '137',
                    image: unique[0],
                    tooltip: 'Harness demonstration - removes itself'
                }, 3000);
                if (!expect.ok('a portrait chip (a real standing, or a demonstration one)', !!itemId)) return;

                const current = chipElement(itemId)?.querySelector('img')?.getAttribute('src') ?? '';
                const next = unique.find((img) => img !== current);
                if (!expect.ok('a different portrait to swap to', !!next)) return;

                api.updateSecondaryBarItemInfo(BAR, itemId, { image: next });
                expect.ok(real
                    ? `swapped ${real} to another portrait — expect a short fade, not a cut`
                    : 'no standing chip on the bar yet, so a demonstration chip was added — expect a '
                        + 'short fade, then the chip removes itself', true);
            }
        }
    ]
};
