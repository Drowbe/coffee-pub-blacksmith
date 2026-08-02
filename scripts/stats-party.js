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
// menubar readout re-rendering on every combat update cannot. Reads
// here are synchronous against the cache, and the cache is rebuilt on
// the events that can change it.

import { MODULE } from './const.js';
import { postConsoleAndNotification, getPortraitImage } from './api-core.js';
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

        postConsoleAndNotification(MODULE.NAME, 'Party Stats | Initialized', '', true, false);
    }

    /**
     * Drop the cached aggregate. The next read rebuilds it.
     */
    static invalidate() {
        PartyStats._cache = null;
        PartyStats._building = null;
    }

    /**
     * The party aggregate, from cache when it is warm.
     * @returns {Promise<Object>}
     */
    static async getAggregate() {
        if (PartyStats._cache) return PartyStats._cache;
        if (PartyStats._building) return PartyStats._building;
        PartyStats._building = PartyStats._build()
            .then((result) => {
                PartyStats._cache = result;
                PartyStats._building = null;
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
     * The aggregate if it is already built, otherwise null and a rebuild is
     * kicked off. For callers that render synchronously and cannot await — a
     * menubar readout draws whatever it has and picks the rest up on the next
     * render, rather than blocking or forcing an async render path.
     * @returns {Object|null}
     */
    static getAggregateSync() {
        if (PartyStats._cache) return PartyStats._cache;
        void PartyStats.getAggregate();
        return null;
    }

    /**
     * The party: player-owned actors, excluding token-synthetic ones. Same
     * definition the Party Statistics window used, kept in one place so a
     * second consumer cannot disagree about who counts.
     */
    static getPartyActors() {
        return game.actors.filter((actor) => actor.hasPlayerOwner && !actor.isToken);
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

        for (const summary of history) {
            const totals = summary?.totals || {};
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
            leaderboard
        };
    }
}
