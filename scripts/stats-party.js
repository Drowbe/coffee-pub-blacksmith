// ==================================================================
// ===== PARTY STATS ================================================
// ==================================================================
// Party-wide aggregates over per-actor lifetime stats and stored
// combat history. Both are per-actor or per-combat at the source, so
// anything party-wide has to be reduced — this is the one place that
// happens, and the result is cached rather than recomputed per read.
//
// The cache matters: reducing means awaiting getStats for every
// player-owned actor. A window opened occasionally can afford that; a
// menubar readout re-rendering on every combat update cannot.
//
// PUBLISHED BY THE GM, NOT COMPUTED PER CLIENT. `getPartyActors()` reduces
// `game.actors` on whichever client calls it, and `game.actors` is not the
// same collection on every client -- Foundry only syncs documents a user has
// at least Observer permission on. A GM sees the whole party; a low-privilege
// viewer (a stream/spectator account, deliberately locked down per Herald's
// own setup guide) may not, and would silently compute an incomplete or empty
// answer with no indication anything was wrong. That defeats the reason this
// API exists: "a second consumer reducing it again would be a second
// definition of who counts as the party" was meant to guard against a
// consumer re-implementing this logic, not against the one shared
// implementation giving a different answer depending who asks.
//
// So only the active GM's client ever calls `_build()`; every other client
// reads the aggregate the GM already published to the `partyStatsAggregate`
// world setting (`_publish()`). `invalidate()` kicks off an immediate
// rebuild-and-republish when it runs on the GM's client, rather than only
// marking the local cache dirty, so other clients see a fresh answer without
// needing the GM to happen to open a window that reads it. A client with no
// GM ever connected this session (nothing published yet) falls back to a
// local build, best-effort.
//
// Confirmed live 2026-09: a Herald stream widget on an Observer-only camera
// account read an empty leaderboard indefinitely, even though Squire's own
// panel (running on ordinary player/GM clients) found the same data every
// time -- not because Squire's per-actor flag reads are more permission-
// tolerant, but because it never runs on the kind of restricted client this
// API's bulk `game.actors.filter()` approach was never safe for.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getPortraitImage, isPlayerCharacter, getSettingSafely, setSettingSafely } from './api-core.js';
import { HookManager } from './manager-hooks.js';
import { CPBPlayerStats } from './stats-player.js';
import { CombatStats } from './stats-combat.js';

const NO_ONE = { actorId: null, name: '—', img: 'icons/svg/mystery-man.svg' };

export class PartyStats {
    /** @type {Object|null} Last computed aggregate; null means dirty. */
    static _cache = null;
    /** @type {Promise<Object>|null} In-flight rebuild, so concurrent reads share one pass. */
    static _building = null;

    static initialize() {
        // Everything that can move these numbers. Lifetime figures only
        // change when a combat ends or history is edited; membership changes
        // when an actor is created, deleted, or its ownership changes.
        const invalidate = () => PartyStats.invalidate();

        Hooks.on('blacksmith.combatSummaryReady', invalidate);

        for (const [name, description] of [
            ['updateActor', 'Party Stats: Invalidate aggregate when an actor changes'],
            ['createActor', 'Party Stats: Invalidate aggregate when an actor is added'],
            ['deleteActor', 'Party Stats: Invalidate aggregate when an actor is removed']
        ]) {
            HookManager.registerHook({
                name,
                description,
                context: 'stats-party-invalidate',
                priority: 3,
                callback: invalidate
            });
        }

        // Seed the published setting immediately, on the GM's client, rather than
        // waiting for the first invalidating event. Without this, a session where
        // nothing has changed an actor or ended a combat since this module last
        // loaded leaves `partyStatsAggregate` at its `null` default indefinitely —
        // every non-GM reader (a stream widget included) falls through to a local
        // best-effort build for no reason other than nobody has published yet.
        if (game.users?.activeGM?.isSelf === true) void PartyStats.getAggregate();

        postConsoleAndNotification(MODULE.NAME, 'Party Stats | Initialized', '', true, false);
    }

    /** @type {Function|null} Debounced rebuild-and-republish, built once. */
    static _republishDebounced = null;

    /**
     * Drop the cached aggregate. On the active GM's client this also schedules
     * a rebuild-and-republish -- see the file header for why waiting for the
     * GM to happen to read it themselves is not good enough for other clients.
     *
     * Debounced rather than immediate: `updateActor` is one of the invalidating
     * hooks, and HP changes fire it on every hit landed, not just on membership
     * or ownership changes. An immediate rebuild would turn every hit of an
     * active combat into a full history reduction plus a world-setting write —
     * a socket broadcast per hit. Coalescing rapid invalidations into one
     * rebuild after they settle keeps the publish prompt without doing that.
     */
    static invalidate() {
        PartyStats._cache = null;
        PartyStats._building = null;
        if (game.users?.activeGM?.isSelf !== true) return;
        PartyStats._republishDebounced ??= foundry.utils.debounce(() => void PartyStats.getAggregate(), 2000);
        PartyStats._republishDebounced();
    }

    /**
     * The party aggregate. On the active GM's client this builds (or serves
     * from cache) and publishes the result for everyone else. Every other
     * client reads what the GM already published, falling back to a local
     * build only if nothing has been published yet this session -- see the
     * file header for why a non-GM client should not reduce the party itself
     * when a published answer is available.
     * @returns {Promise<Object>}
     */
    static async getAggregate() {
        if (game.users?.activeGM?.isSelf !== true) {
            const published = getSettingSafely(MODULE.ID, 'partyStatsAggregate', null);
            if (PartyStats._isPublished(published)) return published;
        }

        if (PartyStats._cache) return PartyStats._cache;
        if (PartyStats._building) return PartyStats._building;
        PartyStats._building = PartyStats._build()
            .then(async (result) => {
                PartyStats._cache = result;
                PartyStats._building = null;
                if (game.users?.activeGM?.isSelf === true) await PartyStats._publish(result);
                return result;
            })
            .catch((error) => {
                PartyStats._building = null;
                postConsoleAndNotification(MODULE.NAME, 'Party Stats: Failed to build aggregate', error?.message ?? error, false, false);
                return PartyStats._empty();
            });
        return PartyStats._building;
    }

    /**
     * The aggregate if it is already available, otherwise null and a rebuild
     * (or a read of the published value) is kicked off. For callers that
     * render synchronously and cannot await — a menubar readout draws whatever
     * it has and picks the rest up on the next render, rather than blocking or
     * forcing an async render path.
     * @returns {Object|null}
     */
    static getAggregateSync() {
        if (game.users?.activeGM?.isSelf !== true) {
            const published = getSettingSafely(MODULE.ID, 'partyStatsAggregate', null);
            if (PartyStats._isPublished(published)) return published;
        }
        if (PartyStats._cache) return PartyStats._cache;
        void PartyStats.getAggregate();
        return null;
    }

    /**
     * Whether a value read from the `partyStatsAggregate` setting is a real
     * published aggregate rather than the setting's own default. That default
     * is `{}`, not `null` — an Object-type setting's default must itself be an
     * object, or `game.settings.register()` throws at registration and the key
     * never registers at all (found live 2026-09, `"...partyStatsAggregate" is
     * not a registered game setting` on every reader). `{}` is truthy, so a
     * plain truthy check would treat the untouched default as a real
     * (empty-looking) published aggregate and never fall through to a local
     * build. `totalCombats` is always a number on both `_build()`'s and
     * `_empty()`'s output, never on the bare setting default.
     */
    static _isPublished(value) {
        return typeof value?.totalCombats === 'number';
    }

    /**
     * Write the aggregate to the world setting other clients read. GM-only —
     * `getAggregate()` never calls this except on the active GM's own client.
     */
    static async _publish(result) {
        const ok = await setSettingSafely(MODULE.ID, 'partyStatsAggregate', result);
        if (!ok) postConsoleAndNotification(MODULE.NAME, 'Party Stats: Failed to publish aggregate', '', false, false);
    }

    /**
     * The party: player-owned actors, excluding token-synthetic ones. Same
     * definition the Party Statistics window used, kept in one place so a
     * second consumer cannot disagree about who counts.
     */
    static getPartyActors() {
        return game.actors.filter((actor) => isPlayerCharacter(actor) && !actor.isToken);
    }

    static _empty() {
        return {
            totalCombats: 0,
            totalRounds: 0,
            averageHitRate: '0.0',
            averageHitRateValue: 0,
            topMvp: { name: NO_ONE.name, img: NO_ONE.img },
            biggestHit: { ...NO_ONE, amount: 0 },
            mostCrits: { ...NO_ONE, count: 0 },
            mostFumbles: { ...NO_ONE, count: 0 },
            mostHits: { ...NO_ONE, count: 0 },
            mostMisses: { ...NO_ONE, count: 0 },
            totalCriticals: 0,
            totalFumbles: 0,
            totalKills: 0,
            totalDamageGiven: 0,
            totalDamageTaken: 0,
            totalHealsGiven: 0,
            damageSeries: [],
            hitRateSeries: [],
            leaderboard: []
        };
    }

    static async _build() {
        const history = CombatStats.getCombatHistory(null) || [];

        // Totals come from stored combat summaries, whose `totals` are already
        // party-only by policy — NPCs appear in participants for context but
        // never in these figures.
        let totalHits = 0;
        let totalMisses = 0;
        let totalDamageGiven = 0;
        let totalDamageTaken = 0;
        let totalHealsGiven = 0;
        let totalCriticals = 0;
        let totalFumbles = 0;
        let totalKills = 0;
        let totalRounds = 0;

        // Per-combat series for the spark readouts, gathered in the walk that already reduces this
        // history rather than in a second pass. `getCombatHistory(null)` is newest-first, so these
        // are reversed at the end to read left-to-right as time.
        const damageSeries = [];
        const hitRateSeries = [];

        for (const summary of history) {
            const totals = summary?.totals || {};
            damageSeries.push(Number(totals.damageDealt) || 0);
            {
                const attempts = (Number(totals.hits) || 0) + (Number(totals.misses) || 0);
                hitRateSeries.push(attempts > 0 ? ((Number(totals.hits) || 0) / attempts) * 100 : 0);
            }
            totalHits += totals.hits || 0;
            totalMisses += totals.misses || 0;
            totalDamageGiven += totals.damageDealt || 0;
            totalDamageTaken += totals.damageTaken || 0;
            totalHealsGiven += totals.healingGiven || 0;
            totalCriticals += totals.criticals || 0;
            totalFumbles += totals.fumbles || 0;
            totalKills += totals.kills || 0;
            totalRounds += summary?.totalRounds || 0;
        }

        const totalAttacks = totalHits + totalMisses;
        const averageHitRate = totalAttacks > 0 ? ((totalHits / totalAttacks) * 100).toFixed(1) : '0.0';

        // Per-actor standings come from lifetime flags, not from history.
        const entries = [];
        for (const actor of PartyStats.getPartyActors()) {
            try {
                const stats = await CPBPlayerStats.getPlayerStats(actor.id);
                if (!stats) continue;
                const attacks = stats?.lifetime?.attacks || {};
                const mvp = stats?.lifetime?.mvp || {};
                entries.push({
                    actorId: actor.id,
                    name: actor.name,
                    img: getPortraitImage(actor) || NO_ONE.img,
                    biggestHit: attacks.biggest?.amount || 0,
                    crits: attacks.criticals || 0,
                    fumbles: attacks.fumbles || 0,
                    hits: attacks.totalHits || 0,
                    misses: attacks.totalMisses || 0,
                    mvp: {
                        totalScore: Number(mvp.totalScore || 0),
                        combats: mvp.combats || 0,
                        averageScore: Number(mvp.averageScore || 0),
                        highScore: Number(mvp.highScore || 0)
                    }
                });
            } catch (error) {
                postConsoleAndNotification(MODULE.NAME, 'Party Stats: Failed to load player stats', { actorId: actor.id, error }, true, false);
            }
        }

        // Ties break on MVP total — highest wins a "most" tile, lowest wins
        // "most misses", since being worst at something is not an achievement
        // the best player should also collect.
        const best = (field, prefer = 'high') => {
            let winner = null;
            for (const entry of entries) {
                if (!winner || entry[field] > winner[field]) {
                    winner = entry;
                    continue;
                }
                if (entry[field] === winner[field]) {
                    const a = entry.mvp.totalScore;
                    const b = winner.mvp.totalScore;
                    if (prefer === 'high' ? a > b : a < b) winner = entry;
                }
            }
            return winner;
        };

        const tile = (entry, field, key) => entry && entry[field] > 0
            ? { actorId: entry.actorId, name: entry.name, img: entry.img, [key]: entry[field] }
            : { ...NO_ONE, [key]: 0 };

        const leaderboard = entries
            .filter((entry) => entry.mvp.combats)
            .sort((a, b) => b.mvp.totalScore - a.mvp.totalScore)
            .map((entry, index) => ({
                rank: index + 1,
                actorId: entry.actorId,
                name: entry.name,
                img: entry.img,
                mvp: {
                    totalScore: entry.mvp.totalScore.toFixed(1),
                    combats: entry.mvp.combats,
                    averageScore: entry.mvp.averageScore.toFixed(1),
                    highScore: entry.mvp.highScore.toFixed(1)
                },
                crits: entry.crits,
                fumbles: entry.fumbles,
                biggestHit: entry.biggestHit > 0 ? entry.biggestHit : '—'
            }));

        const top = leaderboard[0];

        return {
            totalCombats: history.length,
            totalRounds,
            averageHitRate,
            averageHitRateValue: parseFloat(averageHitRate),
            topMvp: top ? { actorId: top.actorId, name: top.name, img: top.img } : { name: NO_ONE.name, img: NO_ONE.img },
            biggestHit: tile(best('biggestHit'), 'biggestHit', 'amount'),
            mostCrits: tile(best('crits'), 'crits', 'count'),
            mostFumbles: tile(best('fumbles'), 'fumbles', 'count'),
            mostHits: tile(best('hits'), 'hits', 'count'),
            mostMisses: tile(best('misses', 'low'), 'misses', 'count'),
            totalCriticals,
            totalFumbles,
            totalKills,
            totalDamageGiven,
            totalDamageTaken,
            totalHealsGiven,
            // Oldest first, so a spark reads left to right as time does.
            damageSeries: damageSeries.slice().reverse(),
            hitRateSeries: hitRateSeries.slice().reverse(),
            leaderboard
        };
    }
}
