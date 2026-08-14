// ==================================================================
// ===== SUITE: api.stats ===========================================
// ==================================================================
//
// DO NOT PASTE THIS INTO A FOUNDRY MACRO — it is an ES module and a macro
// rejects it on the export. Paste testing/test-harness.js instead; it
// loads this suite itself.
//
// Contract: documentation/api/api-stats.md
// Architecture: documentation/architecture/architecture-stats.md
// Implementation: scripts/stats-combat.js, stats-player.js, stats-party.js
//
// Most of what can go wrong here is not "a number is off by one" — it is
// two code paths disagreeing about what a number MEANS. The party
// aggregate and the Party Statistics window were two reductions until
// stats.party landed; the running-combat getter and the end-of-combat
// summary card would have been two more. So the checks that matter are
// the INVARIANTS between those paths, not sample values:
//
//   - totals are party-only; participants include NPCs
//   - the running combat and the finished summary are built by one
//     reduction, so they must agree at the moment combat ends
//   - the three tiers (round / running combat / finished combat) are
//     genuinely different scopes despite adjacent names
//
// Sample values cannot be asserted at all: a world's stats are whatever
// that table has played. Everything here is either a shape assertion, an
// internal-consistency assertion, or a comparison the harness makes
// across two points in time.
// ==================================================================

import { requireApi, settingRow } from '../harness-lib.js';

const MODULE_ID = 'coffee-pub-blacksmith';

/**
 * Snapshot taken by the interactive "capture" check and consumed by the
 * comparison check after combat ends. Module scope so it survives between
 * button presses; the harness dialog stays open across both.
 */
let capturedRunning = null;

/** Every key the party aggregate promises, per PartyStats._empty(). */
const PARTY_AGGREGATE_KEYS = [
    'totalCombats', 'totalRounds', 'averageHitRate', 'averageHitRateValue',
    'topMvp', 'biggestHit', 'mostCrits', 'mostFumbles', 'mostHits', 'mostMisses',
    'totalCriticals', 'totalFumbles', 'totalKills',
    'totalDamageGiven', 'totalDamageTaken', 'totalHealsGiven', 'leaderboard'
];

/** Every key a running-combat or stored-summary `totals` block promises. */
const TOTALS_KEYS = [
    'hits', 'misses', 'totalAttacks', 'kills',
    'damageDealt', 'damageTaken', 'healingGiven',
    'criticals', 'fumbles', 'hitRate'
];

const sum = (list, field) => list.reduce((total, entry) => total + (Number(entry?.[field]) || 0), 0);

export default {
    id: 'stats',
    label: 'Stats',
    icon: 'fa-solid fa-chart-simple',

    settings: () => {
        const api = game.modules.get(MODULE_ID)?.api;
        const stats = api?.stats;
        let tracking = 'unknown';
        try {
            tracking = game.settings.get(MODULE_ID, 'trackCombatStats') ? 'on' : 'OFF';
        } catch (_) {
            tracking = 'not registered';
        }
        return [
            settingRow('api.stats', stats ? 'available' : 'MISSING'),
            settingRow('stats.party', stats?.party ? 'available' : 'MISSING'),
            settingRow('stats.combat.getRunningStats', stats?.combat?.getRunningStats ? 'available' : 'MISSING'),
            settingRow('trackCombatStats', tracking,
                'every WRITE path is gated on this and on being GM; reads are not'),
            settingRow('You are GM', game.user.isGM ? 'yes' : 'NO',
                'only the GM accumulates, but every client reads the mirrored flag'),
            settingRow('Combat running', game.combat?.started ? `yes (round ${game.combat.round})` : 'no'),
            settingRow('Running combat mirror',
                (() => {
                    if (!game.combat?.started) return 'n/a - no combat';
                    const flag = game.combat?.getFlag(MODULE_ID, 'combatStats');
                    // Worded to contain "MISSING" so the harness highlights it red —
                    // it keys the warning colour off the value text.
                    if (!flag) return 'MISSING - not mirrored yet';
                    return `present (${Object.keys(flag.participantStats || {}).length} participants)`;
                })(),
                'what every client reads, GM included - if this is missing the whole table sees placeholders'),
            settingRow('Stored combats', String((stats?.combat?.getCombatHistory(null) || []).length))
        ];
    },

    checks: [
        {
            id: 'surface',
            group: 'Surface',
            tier: 'headless',
            label: 'Surface: the three namespaces and every documented method exist',
            note: 'A missing method here means a consumer breaks, not that a number is wrong.',
            run: async ({ expect }) => {
                const { stats } = requireApi('stats');

                const expectFns = (namespace, names) => {
                    for (const name of names) {
                        expect.ok(`stats.${namespace}.${name} is a function`,
                            typeof stats?.[namespace]?.[name] === 'function');
                    }
                };

                expectFns('player', [
                    'getStats', 'getLifetimeStats', 'getSessionStats',
                    'getStatCategory', 'clearStats', 'clearAllStats'
                ]);
                expectFns('party', ['getAggregate', 'getAggregateSync', 'getPartyActors', 'refresh']);
                expectFns('combat', [
                    'getCurrentStats', 'getRunningStats', 'getParticipantStats',
                    'getNotableMoments', 'getRoundSummary', 'getCombatSummary',
                    'getCombatHistory', 'clearHistory', 'removeCombat'
                ]);
            }
        },

        {
            id: 'tiers',
            group: 'Surface',
            tier: 'headless',
            label: 'Tiers: round, running combat, and finished combat are distinct scopes',
            note: 'The names sit close together and getCurrentStats() reads as "now" but means "this round".',
            run: async ({ expect, log }) => {
                const { stats } = requireApi('stats.combat');
                const { combat } = stats;

                expect.ok('getCurrentStats and getRunningStats are different functions',
                    combat.getCurrentStats !== combat.getRunningStats);

                // The round accumulator always answers, defaulting rather than nulling.
                const round = combat.getCurrentStats();
                expect.ok('getCurrentStats() never returns null', round !== null && round !== undefined);
                expect.ok('getCurrentStats() is round-shaped (has partyStats)',
                    Object.prototype.hasOwnProperty.call(round ?? {}, 'partyStats'));

                // The running combat nulls when there is nothing to report, which is
                // what lets a readout hide rather than render zeroes.
                const running = combat.getRunningStats();
                if (!game.combat?.started) {
                    expect('with no combat running, getRunningStats() is null', running, null);
                } else if (running === null) {
                    // Not a failure. Every client reads the mirrored flag, which the GM
                    // writes on a debounce, so a combat that has just started genuinely
                    // has nothing to report yet. Asserting an object here would fail on
                    // timing rather than on behaviour.
                    log('Combat is running but nothing has been mirrored yet — expected in the first moments, or with trackCombatStats off.');
                    expect.ok('a combat with no mirror yet reports null rather than an empty object', true);
                } else {
                    expect.ok('with a mirrored combat, getRunningStats() returns an object',
                        typeof running === 'object');
                }
            }
        },

        {
            id: 'running-shape',
            group: 'Running combat',
            tier: 'headless',
            label: 'Running combat: shape matches the stored summary field for field',
            note: 'Skips cleanly with no combat running — start one and re-run to exercise it.',
            run: async ({ expect, log }) => {
                const { stats } = requireApi('stats.combat.getRunningStats');
                const running = stats.combat.getRunningStats();

                if (!running) {
                    log('No combat is being tracked, so there is nothing to shape-check. ' +
                        'Start a combat (as GM, with trackCombatStats on) and run this again.');
                    expect.ok('skipped: no combat running', true);
                    return;
                }

                for (const key of ['combatId', 'round', 'duration', 'durationSeconds',
                                   'totals', 'participants', 'notableMoments']) {
                    expect.ok(`running stats carry ${key}`,
                        Object.prototype.hasOwnProperty.call(running, key));
                }

                for (const key of TOTALS_KEYS) {
                    expect.ok(`totals.${key} is present`,
                        Object.prototype.hasOwnProperty.call(running.totals ?? {}, key));
                }

                expect.ok('participants is an array', Array.isArray(running.participants));
                expect.ok('notableMoments.topHits is an array', Array.isArray(running.notableMoments?.topHits));
                expect.ok('notableMoments.topHeals is an array', Array.isArray(running.notableMoments?.topHeals));
                expect.ok('notableMoments.mvpRankings is an array', Array.isArray(running.notableMoments?.mvpRankings));

                // Scene metadata and the per-round breakdown belong to a FINISHED combat
                // and are deliberately absent here. If they appear, the live getter has
                // drifted toward being a summary and the two shapes will diverge.
                expect.ok('running stats carry no sceneName', running.sceneName === undefined);
                expect.ok('running stats carry no rounds array', running.rounds === undefined);
            }
        },

        {
            id: 'running-mirror',
            group: 'Running combat',
            tier: 'headless',
            label: 'Running combat: the mirror everyone reads agrees with the GM\'s memory',
            note: 'Run as GM. Every client, GM included, reads the mirrored flag — this is the check that it is not stale.',
            run: async ({ expect, log }) => {
                const { stats } = requireApi('stats.combat.getRunningStats');

                // Skip on combat state, not on whether the accumulator exists.
                // `initialize()` assigns `combatStats` a deep clone of the defaults on
                // every GM client with tracking on, so it is truthy from load onward and
                // says nothing about whether a fight is happening — guarding on it made
                // this check assert that a flag existed when there was no combat to
                // carry one, and fail every run with the world idle.
                if (!game.combat?.started) {
                    log('No combat running, so there is no mirror to compare. Start one, land an attack, then re-run as GM.');
                    expect.ok('skipped: no combat running', true);
                    return;
                }

                const live = stats.combat.getRunningStats();

                // The flag is what getRunningStats() reads on every client, so comparing
                // the two would be comparing a value to itself. The honest comparison is
                // against the GM's in-memory accumulator, which is the thing being
                // mirrored — if those diverge, the mirror is stale or malformed and the
                // whole table is looking at the wrong numbers.
                const memory = stats.CombatStats.combatStats;
                if (!memory) {
                    log('No in-memory accumulator on this client — not the GM, or tracking is off. The mirror itself reads fine.');
                    expect.ok('skipped: no in-memory accumulator on this client', true);
                    return;
                }

                expect.ok('the combat carries a combatStats flag', live !== null);
                if (!live) {
                    log('No mirror yet. It is written on a 1s debounce, so re-run a moment after an attack.');
                    return;
                }

                const fromMemory = stats.CombatStats._buildCombatAggregate(memory);
                expect.ok('the in-memory accumulator reduces to an aggregate', fromMemory !== null);
                if (!fromMemory) return;

                expect('participant count matches what was mirrored',
                    live.participants.length, fromMemory.participants.length);
                for (const key of ['hits', 'misses', 'damageDealt', 'criticals', 'fumbles', 'kills']) {
                    // Both sides run the same reduction, so a mismatch is a stale or
                    // lossy mirror, not arithmetic. Report the pair to make that plain.
                    // A one-debounce lag can legitimately show here if an attack landed
                    // in the last second — re-run before calling it a failure.
                    expect.ok(`totals.${key} agrees (mirror ${live.totals[key]}, memory ${fromMemory.totals[key]})`,
                        live.totals[key] === fromMemory.totals[key]);
                }
                log(`Mirror and in-memory accumulator agree on ${live.participants.length} participants.`);
            }
        },

        {
            id: 'party-only-policy',
            group: 'Running combat',
            tier: 'headless',
            label: 'Policy: totals are party-only while participants include NPCs',
            note: 'The invariant a second reducer would break. Needs a combat with recorded attacks.',
            run: async ({ expect, log }) => {
                const { stats } = requireApi('stats.combat.getRunningStats');
                const running = stats.combat.getRunningStats();

                if (!running?.participants?.length) {
                    log('No tracked participants yet. Start a combat and land a few attacks, then re-run.');
                    expect.ok('skipped: nothing recorded yet', true);
                    return;
                }

                const party = running.participants.filter(p => p.isPlayer);
                log(`${running.participants.length} participants, ${party.length} of them party.`);

                // Totals must be the party subset reduced — not every participant.
                expect('totals.hits equals the party subset', running.totals.hits, sum(party, 'hits'));
                expect('totals.misses equals the party subset', running.totals.misses, sum(party, 'misses'));
                expect('totals.damageDealt equals the party subset', running.totals.damageDealt, sum(party, 'damageDealt'));
                expect('totals.criticals equals the party subset', running.totals.criticals, sum(party, 'criticals'));
                expect('totals.fumbles equals the party subset', running.totals.fumbles, sum(party, 'fumbles'));
                expect('totals.kills equals the party subset', running.totals.kills, sum(party, 'kills'));

                expect('totalAttacks is hits plus misses',
                    running.totals.totalAttacks, running.totals.hits + running.totals.misses);

                // MVP is party-only too; an NPC in the rankings means the filter was lost.
                const partyIds = new Set(party.map(p => p.actorId));
                const strangers = (running.notableMoments.mvpRankings ?? [])
                    .filter(entry => !partyIds.has(entry.actorId));
                expect('MVP rankings contain no non-party actors', strangers.length, 0);

                // Rankings are the ordering the bar and the card both read.
                const scores = (running.notableMoments.mvpRankings ?? []).map(entry => entry.score);
                const sorted = [...scores].sort((a, b) => b - a);
                expect.ok('MVP rankings are sorted descending by score',
                    scores.every((value, index) => value === sorted[index]));

                if (running.notableMoments.mvp) {
                    expect('the MVP is the top-ranked entry',
                        running.notableMoments.mvp.actorId,
                        running.notableMoments.mvpRankings[0]?.actorId);
                }
            }
        },

        {
            id: 'party-aggregate',
            group: 'Party aggregate',
            tier: 'headless',
            label: 'Party aggregate: full shape, and the sync read agrees with the async one',
            run: async ({ expect }) => {
                const { stats } = requireApi('stats.party');

                const aggregate = await stats.party.getAggregate();
                expect.ok('getAggregate() resolves to an object',
                    aggregate !== null && typeof aggregate === 'object');

                for (const key of PARTY_AGGREGATE_KEYS) {
                    expect.ok(`aggregate carries ${key}`,
                        Object.prototype.hasOwnProperty.call(aggregate ?? {}, key));
                }

                expect.ok('leaderboard is an array', Array.isArray(aggregate?.leaderboard));

                // Warm cache: the sync read must now return the same object the async
                // read produced. If it returns null here, the cache is not being kept
                // and every synchronous consumer will render empty.
                const sync = stats.party.getAggregateSync();
                expect.ok('getAggregateSync() is warm after getAggregate()', sync !== null);
                expect('the sync read agrees on totalCombats', sync?.totalCombats, aggregate?.totalCombats);
                expect('the sync read agrees on totalKills', sync?.totalKills, aggregate?.totalKills);

                const actors = stats.party.getPartyActors();
                expect.ok('getPartyActors() returns an array', Array.isArray(actors));
                expect.ok('every party actor is player-owned',
                    actors.every(actor => actor?.hasPlayerOwner));
                expect.ok('no synthetic token actors are counted',
                    actors.every(actor => !actor?.isToken));
            }
        },

        {
            id: 'party-refresh',
            group: 'Party aggregate',
            tier: 'headless',
            label: 'Party aggregate: refresh() rebuilds and lands on the same answer',
            note: 'Nothing changed between the two reads, so a difference means the build is not deterministic.',
            run: async ({ expect }) => {
                const { stats } = requireApi('stats.party');

                const before = await stats.party.getAggregate();
                stats.party.refresh();
                const after = await stats.party.getAggregate();

                expect('totalCombats survives a refresh', after?.totalCombats, before?.totalCombats);
                expect('totalKills survives a refresh', after?.totalKills, before?.totalKills);
                expect('averageHitRate survives a refresh', after?.averageHitRate, before?.averageHitRate);
                expect('the leaderboard length survives a refresh',
                    after?.leaderboard?.length, before?.leaderboard?.length);
                expect('biggestHit survives a refresh',
                    after?.biggestHit?.amount, before?.biggestHit?.amount);
            }
        },

        {
            id: 'history-cap',
            group: 'History',
            tier: 'headless',
            label: 'History: the limit is a read-time cap, not a storage bound',
            note: 'Passing null must return everything. Truncating storage would break lifetime verifiability.',
            run: async ({ expect, log }) => {
                const { stats } = requireApi('stats.combat.getCombatHistory');

                const all = stats.combat.getCombatHistory(null) || [];
                log(`${all.length} combats stored.`);

                expect.ok('getCombatHistory(null) returns an array', Array.isArray(all));

                const capped = stats.combat.getCombatHistory(1) || [];
                expect.ok('a limit of 1 returns at most one entry', capped.length <= 1);

                if (all.length > 1) {
                    expect('the limit does not reduce what is stored',
                        (stats.combat.getCombatHistory(null) || []).length, all.length);
                    expect('the capped read starts at the newest entry',
                        capped[0]?.combatId, all[0]?.combatId);
                } else {
                    log('Fewer than two stored combats, so ordering could not be checked.');
                }
            }
        },

        {
            id: 'capture-running',
            group: 'Running combat vs. stored summary',
            tier: 'interactive',
            label: '1. Capture the running combat (press this BEFORE ending combat)',
            note: 'Stores a snapshot for the comparison check below. Needs a combat with recorded attacks.',
            run: async ({ log }) => {
                const stats = game.modules.get(MODULE_ID)?.api?.stats;
                const running = stats?.combat?.getRunningStats();

                if (!running) {
                    capturedRunning = null;
                    ui.notifications.warn('No combat is being tracked — nothing to capture.');
                    log('getRunningStats() returned null. Start a combat as GM with trackCombatStats on.');
                    return;
                }

                capturedRunning = foundry.utils.deepClone(running);
                log(`Captured round ${running.round}: ${running.totals.hits} hits, ` +
                    `${running.totals.damageDealt} damage dealt, ` +
                    `MVP ${running.notableMoments.mvp?.name ?? 'none'}.`);
                log('Now end the combat, then run check 2.');
                ui.notifications.info('Running combat captured. End combat, then run check 2.');
            }
        },

        {
            id: 'compare-to-summary',
            group: 'Running combat vs. stored summary',
            tier: 'interactive',
            label: '2. Compare that capture against the finished summary',
            note: 'The one reduction shared by both must produce the same numbers. Run after ending combat.',
            run: async ({ expect, log }) => {
                if (!capturedRunning) {
                    log('Nothing captured. Run check 1 while a combat is still running.');
                    ui.notifications.warn('Run check 1 first, before ending combat.');
                    return;
                }

                const stats = game.modules.get(MODULE_ID)?.api?.stats;
                const summary = stats?.combat?.getCombatSummary();

                if (!summary) {
                    log('No stored summary. End the combat first, then run this again.');
                    ui.notifications.warn('No combat summary stored yet.');
                    return;
                }

                if (summary.combatId !== capturedRunning.combatId) {
                    log(`The newest summary is for combat ${summary.combatId}, but the capture was ` +
                        `for ${capturedRunning.combatId}. Comparing anyway — expect differences.`);
                }

                // The capture was taken slightly before the end, so anything that happened
                // in between legitimately moves these numbers UP. What must never happen is
                // the summary reporting LESS than was already observed, or a field being
                // shaped differently — either means the two paths are not the same reduction.
                for (const key of TOTALS_KEYS) {
                    expect.ok(`summary.totals.${key} exists as it did live`,
                        Object.prototype.hasOwnProperty.call(summary.totals ?? {}, key));
                }

                const monotonic = ['hits', 'misses', 'damageDealt', 'damageTaken',
                                   'healingGiven', 'criticals', 'fumbles', 'kills'];
                for (const key of monotonic) {
                    const live = Number(capturedRunning.totals[key]) || 0;
                    const final = Number(summary.totals[key]) || 0;
                    expect.ok(`totals.${key}: summary (${final}) is not below the live read (${live})`,
                        final >= live);
                }

                const liveParty = capturedRunning.participants.filter(p => p.isPlayer).length;
                const finalParty = summary.participants.filter(p => p.isPlayer).length;
                expect.ok(`party membership did not shrink (${liveParty} live, ${finalParty} final)`,
                    finalParty >= liveParty);

                // MVP ordering is the visible one: the bar shows a leader mid-fight and the
                // card shows one after. They are allowed to differ only because the fight
                // continued, never because they are scored differently.
                log(`MVP live: ${capturedRunning.notableMoments.mvp?.name ?? 'none'} / ` +
                    `final: ${summary.notableMoments.mvp?.name ?? 'none'}`);
                expect.ok('the summary carries MVP rankings as the live read did',
                    Array.isArray(summary.notableMoments?.mvpRankings));

                capturedRunning = null;
                log('Capture cleared. Run check 1 again for another combat.');
            }
        },

        {
            id: 'party-window',
            group: 'Party aggregate',
            tier: 'interactive',
            label: 'Party Statistics window renders from the aggregate',
            note: 'It has no reduction of its own any more, so a wrong figure here is a wrong aggregate.',
            run: async ({ log }) => {
                const stats = game.modules.get(MODULE_ID)?.api?.stats;
                const aggregate = await stats?.party?.getAggregate();

                log(`Aggregate says: ${aggregate?.totalCombats} combats, ` +
                    `biggest hit ${aggregate?.biggestHit?.amount} by ${aggregate?.biggestHit?.name}, ` +
                    `most fumbles ${aggregate?.mostFumbles?.count} by ${aggregate?.mostFumbles?.name}, ` +
                    `top MVP ${aggregate?.topMvp?.name}.`);
                log('Open Party Statistics and confirm the window shows these same figures.');
                ui.notifications.info('Compare the logged figures against the Party Statistics window.');
            }
        }
    ]
};
