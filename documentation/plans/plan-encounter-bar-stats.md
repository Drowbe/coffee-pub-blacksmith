# Plan: Stats on the Encounter Bar

**Status: Planned. No phase implemented.**

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

**Phase 1 — `stats.party`.** Add the namespace with a cached aggregate and the invalidation above. Move the
window's tile and leaderboard computation behind it: top MVP, biggest hit, most crits, most fumbles, most
hits, most misses (each with the actor), party accuracy, damage dealt, damage taken, heals given, kills,
encounter and round counts, and the ranked leaderboard. Repoint `window-stats-party.js` at it and delete
its local reduction. The window must render identically before and after — that is the test.

**Phase 2 — running combat totals.** Add a getter for the whole-combat accumulator so in-combat readouts
have a source. Decide its shape against what the end-of-combat card already uses, so the same fields mean
the same thing in both places.

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
