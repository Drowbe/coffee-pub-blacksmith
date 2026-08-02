# Stats System Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public surface, see `../api/api-stats.md`.

The stats system tracks combat statistics at three scopes — round, combat, and lifetime — plus a transient per-session scope. Round and combat data are ephemeral by design; only the combat *summary* and lifetime totals persist.

## Files and responsibilities

| File | Owns |
|---|---|
| `scripts/stats-combat.js` | Round tracking, combat tracking, summary generation, and the persisted combat history |
| `scripts/stats-player.js` | Lifetime per-actor stats, and GM-only in-memory session state |
| `scripts/stats-party.js` | Party-wide aggregates over the other two, cached; owns no data of its own |
| `scripts/timer-round.js` | Round duration, including `accumulatedTime` (shares a flag with stats-combat — see below) |

`stats-combat.js` never touches lifetime data or actor flags. `stats-player.js` never touches combat flags — its only flag access is `actor.getFlag` / `actor.setFlag(MODULE.ID, 'playerStats')`. The boundary is clean in both directions; keep it that way.

`stats-party.js` reads both and writes neither. It exists because every other tier is per-actor or
per-combat, so anything party-wide has to be reduced, and that reduction should have exactly one
implementation.

## The tiers

- **Round** (`CombatStats.currentStats`) — in memory for the active round, mirrored to the combat `stats` flag. Reset when a new round begins.
- **Combat** (`CombatStats.combatStats`) — aggregates for the active combat: totals for damage, healing, and attack counts, plus per-participant summaries and top-moment highlights. Raw event arrays are discarded when the summary is generated.
- **Lifetime** (actor flag `playerStats`) — permanent per-actor records. GM-only writes.
- **Session** (`CPBPlayerStats._sessionStats`) — a GM-only in-memory Map keyed by actor id, holding transient state. Lost on world reload.

- **Party** (`PartyStats._cache`) — a derived aggregate over lifetime flags and stored combat history. Owns
  nothing; holds no truth of its own.

`_boundedPush` caps round and actor logs (default 1000 entries) so in-memory arrays cannot grow without limit.

## The party aggregate is cached, not derived per read

Building it awaits `getStats` for every player-owned actor and reduces the whole combat history. A window
opened occasionally can afford that; a menubar readout that re-renders on every combat update cannot, and a
second consumer reducing it again would be a second definition of who counts as the party and how ties
break.

So `PartyStats` caches, and invalidates on the events that can change the answer: `blacksmith.combatSummaryReady`
when a combat ends, and actor create, update, and delete for membership and lifetime writes. Reads are
served from cache; `getAggregateSync()` exists for callers that render synchronously and returns null while
a rebuild runs rather than blocking.

Consumers must not reduce the party themselves — the Party Statistics window did until this landed, and its
`_buildSummary` / `_buildLeaderboard` were deleted in favour of the aggregate.

## Persistence

Two things survive a reload, and they behave differently:

**`combatHistory`** — a world setting (type Object, default `[]`) holding every combat summary. `_storeCombatSummary()` (`stats-combat.js:1081`) does `[summary, ...currentHistory]` and writes it back with **no pruning**; the source comment states the intent plainly: "Store all history - no pruning to ensure lifetime stats remain verifiable." It grows without bound and syncs to every client.

This is a deliberate design decision, not an oversight. Do not add pruning without a decision to change that contract — lifetime stats are reconstructable from this history, and truncating it silently breaks that guarantee.

The `20` that appears around this data is **not** a storage bound: `getCombatHistory(limit = 20)` (`:1118`) applies `.slice(0, limit)` at read time. Pass `null` to get everything.

**Actor flag `playerStats`** — lifetime totals, written only by `stats-player.js`.

## Data flow

```
Event occurs (attack, damage, etc.)
  |
stats-combat.js tracks to currentStats (round data)
  |
Round end -> generates round summary -> posts to chat -> discards currentStats
  |
stats-combat.js accumulates into combatStats (aggregates only)
  |
Combat end
  |
stats-combat.js generates the combat summary (aggregates + top N moments)
  |
stats-combat.js persists it to the combatHistory world setting (unbounded)
  |
stats-combat.js fires blacksmith.combatSummaryReady
  |
stats-player.js reads the summary -> updates lifetime stats in actor flags
  |
stats-combat.js discards combatStats; stats-player.js clears session data
  |
Lifetime stats persist in actor flags
```

## Combat flag ownership

Each combat flag has exactly one owner. This was not always true, and the split is deliberate:

| Flag | Owner | Holds |
|---|---|---|
| `stats` | `stats-combat.js` | `currentStats` — written wholesale, safe because nothing else stores here |
| `roundTimer` | `timer-round.js` | `{ startedAt, accumulatedTime }` — this round's timing |
| `totalCombatDuration` | `timer-round.js` | Accumulated duration of completed rounds |

Both subsystems previously stored data under `stats`, which broke in a way worth remembering: `stats-combat` writes that flag wholesale from its in-memory `currentStats`, which has no `accumulatedTime` field — so every write silently discarded the round timer's banked time, producing intermittent under-reported round durations.

The deeper problem was semantic, not just a write collision: both subsystems kept a field called `roundStartTimestamp` and meant **different things by it**. For `stats-combat` it is the wall-clock start of the round (`roundEndTimestamp - roundStartTimestamp` gives `roundDuration`). For the round timer it is the start of the current *active session*, reset whenever the GM's window regains focus. One key could not hold both meanings, which is why merging was not a fix — separate keys were.

Consumers should not read these flags directly. `RoundTimer.getCurrentRoundDuration()` is the public accessor for round elapsed time; `manager-combatbar.js` uses it rather than touching flags.

`_getRoundTiming()` still falls back to the legacy `stats.roundStartTimestamp` / `stats.accumulatedTime` when the `roundTimer` flag is absent, so combats already in progress when the split shipped keep their elapsed time. That fallback is transitional — remove it a release after it lands.

## GM gating

Every tracking path is GM-gated and setting-gated together, in the form `if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;` (`stats-combat.js:109`, `:134`, `:653`). Player clients collect nothing; the GM is the only writer. Any integration that assumes players accumulate their own stats is wrong.

## Hooks

- `blacksmith.combatSummaryReady` — `(summary, combat)` at combat end. This is the supported way to observe stats; there is no subscription API.
- `blacksmith.roundMvpScore` — `{ actorId, actorUuid, score, rank, name }` per round, after the Party Breakdown is generated.

No explicit teardown runs when tracking is disabled, so consumers should remove their own listeners if they stop caring.
