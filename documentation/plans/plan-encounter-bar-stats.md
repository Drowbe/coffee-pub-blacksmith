# Plan: Stats on the Encounter Bar

**Status: Implemented (phases 1-2). Phases 3-4 pending.**

Put party statistics in the encounter bar's middle zone — lifetime standings out of combat, live totals
during one — reading them from the stats API rather than computing them in the bar.

## What goes on the bar

**Out of combat** — the standings. Biggest hitter, most fumbles, most crits, top MVP, and party totals.
These are lifetime figures and change only when a combat ends.

**In combat** — the running fight. The same measures the end-of-combat card already reports, shown while
the fight is still happening rather than after it.

## The data that exists

**Lifetime, per actor** — `stats.player.getStats(actorId)` returns `lifetime.attacks`
(`totalHits`, `totalMisses`, `criticals`, `fumbles`, `biggest.amount`) and `lifetime.mvp`
(`totalScore`, `averageScore`, `highScore`, `combats`). There is no party-wide getter.

**Per combat, persisted** — `stats.combat.getCombatSummary()` and `getCombatHistory()` return stored
summaries. Each carries party totals (hits, misses, damage dealt, damage taken, healing, criticals,
fumbles, kills — player characters only, by policy), `participants[]` with the same fields per actor,
`topHits` / `topHeals` (attacker, target, amount, weapon, isCritical), and MVP rankings.

**Live, this round** — `stats.combat.getCurrentStats()` returns the *round* accumulator: `partyStats`
(hits, misses, kills, damageDealt, damageTaken, healingDone, averageTurnTime) and `notableMoments`.

**The gap for in-combat display**: the whole-combat accumulator (`CombatStats.combatStats` — the object the
end-of-combat summary is generated from, carrying running totals, `participantStats`, `topHits`,
`topHeals`) has **no public getter**. `getCurrentStats()` is per round, not per combat. Showing "damage this
fight" therefore needs an API addition, not a bar calculation.

## Party aggregates must be cached, not derived per read

`window-stats-party.js` builds its tiles and leaderboard by looping every player-owned actor and awaiting
`getStats` for each, then reducing by hand (`:203`, `:300`). That is acceptable for a window opened
occasionally. It is not acceptable for a bar that re-renders on every combat update, and per the standing
rule the bar must not be doing that arithmetic anyway.

So `stats.party` holds a **cached aggregate**, rebuilt on the events that can change it rather than on
every read:

- `blacksmith.combatSummaryReady` — a combat ended, lifetime figures moved
- lifetime stat writes to an actor flag
- history cleared or a combat removed
- party membership changing

Reads are then synchronous and cheap, which is what lets a bar readout consume it. The window consumes the
same aggregate, so the two cannot disagree and the window's local reduction is deleted rather than left as
a second implementation.

## Phases

**Phase 1 — `stats.party`. Done.** `scripts/stats-party.js` holds the aggregate and its cache; `stats.party`
on the API exposes `getAggregate`, `getAggregateSync`, `getPartyActors`, and `refresh`. It reads lifetime
flags and stored history and writes neither. `window-stats-party.js` now consumes it and its
`_buildSummary` / `_buildLeaderboard` are deleted — 211 lines out, 5 in.

`getAggregateSync()` exists for the bar: it returns the cache when warm and null while a rebuild runs, so a
synchronous render draws what it has rather than blocking or being forced async.

**Verify**: the Party Statistics window must render identically to before — the same tiles, the same
leaderboard order, the same totals — since nothing about the computation changed, only where it lives. Then
finish a combat and confirm the figures move without reopening the window twice.

**Phase 2 — running combat totals. Done.** `stats.combat.getRunningStats()` returns the combat in progress:
`{combatId, round, duration, durationSeconds, totals, participants, notableMoments}`, null when nothing is
being tracked.

The shape was not designed separately. `_generateCombatSummary` already reduced `combatStats` into exactly
these fields and then wrapped them in combat metadata, so the reduction is extracted as
`_buildCombatAggregate()` — pure, no metadata, no writes — and both the summary generator and the live
getter call it. A second reducer would have been a second definition of who counts as the party, how misses
are inferred, and how MVP is scored, and the two would have disagreed at the moment combat ends, which is
the one moment the table is looking at both.

Derived on call rather than cached: unlike the party aggregate it changes on essentially every combat
event, so a cache would need invalidating more often than it would be read.

**Verify**: mid-combat, `getRunningStats().totals` tracks damage and hits as they happen; when the combat
ends, the summary card reports the same numbers the last live read did.

**Phase 3 — the readouts.** Register the chosen stats as items in the bar's middle zone, GM visibility
decided per stat. Out-of-combat items read `stats.party`; in-combat items read the phase 2 getter. Values
update on their own events, never on a per-tick re-render, per the rule in `architecture-encounter.md`.

**Phase 4 — pick the set.** Which numbers actually earn their space is a table decision, not a technical
one, and is best made looking at the bar with real data in it. Phase 3 should make adding or removing a
readout a one-line change so this stays cheap.

## Notes

Both API additions want `documentation/api/api-stats.md` updated as they land; the caching design belongs in
an architecture doc once it settles.

The display-only item work in `TODO.md` is not a dependency, but every readout added before it lands needs
the same local style overrides that work removes.
