# Stats System Architecture

**Audience:** Contributors to the Blacksmith codebase. For the public surface, see `../api/api-stats.md`.

The stats system tracks combat statistics at three scopes — round, combat, and lifetime — plus a transient per-session scope. Round and combat data are ephemeral by design; only the combat *summary* and lifetime totals persist.

## Files and responsibilities

| File | Owns |
|---|---|
| `scripts/stats-combat.js` | Round tracking, combat tracking, summary generation, and the persisted combat history |
| `scripts/stats-player.js` | Lifetime per-actor stats, and GM-only in-memory session state |
| `scripts/timer-round.js` | Round duration, including `accumulatedTime` (shares a flag with stats-combat — see below) |

`stats-combat.js` never touches lifetime data or actor flags. `stats-player.js` never touches combat flags — its only flag access is `actor.getFlag` / `actor.setFlag(MODULE.ID, 'playerStats')`. The boundary is clean in both directions; keep it that way.

## The tiers

- **Round** (`CombatStats.currentStats`) — in memory for the active round, mirrored to the combat `stats` flag. Reset when a new round begins.
- **Combat** (`CombatStats.combatStats`) — aggregates for the active combat: totals for damage, healing, and attack counts, plus per-participant summaries and top-moment highlights. Raw event arrays are discarded when the summary is generated.
- **Lifetime** (actor flag `playerStats`) — permanent per-actor records. GM-only writes.
- **Session** (`CPBPlayerStats._sessionStats`) — a GM-only in-memory Map keyed by actor id, holding transient state. Lost on world reload.

`_boundedPush` caps round and actor logs (default 1000 entries) so in-memory arrays cannot grow without limit.

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

## The shared combat `stats` flag

`combat.setFlag(MODULE.ID, 'stats', ...)` is touched by three subsystems, and this is the sharpest trap in the system. The code flags it inline at `stats-combat.js:727-729`.

| Subsystem | Access | Note |
|---|---|---|
| `stats-combat.js` (`:118`, `:142`, `:730`) | **writes wholesale** | Replaces the flag with `currentStats` |
| `timer-round.js` (`:112-116`, `:125-128`, `:217-233`) | read-modify-writes | Owns `accumulatedTime` |
| `manager-combatbar.js` (`:637`) | reads | Display only |

`accumulatedTime` is a `timer-round.js` field and is **not** part of `currentStats`, so every wholesale write from `stats-combat.js` drops it. Because both sides also write `roundStartTimestamp`, a naive merge just relocates the conflict rather than resolving it. The observable symptom is round duration under-reporting after a stats write, and it is ordering-dependent, so it can look intermittent.

This needs an ownership decision — namespace the timer's data under its own flag (requiring a migration for in-flight combats), or make `stats-combat` merge and define precedence — not a patch. Do not "fix" it by changing one writer in isolation.

## GM gating

Every tracking path is GM-gated and setting-gated together, in the form `if (!game.user.isGM || !getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;` (`stats-combat.js:109`, `:134`, `:653`). Player clients collect nothing; the GM is the only writer. Any integration that assumes players accumulate their own stats is wrong.

## Hooks

- `blacksmith.combatSummaryReady` — `(summary, combat)` at combat end. This is the supported way to observe stats; there is no subscription API.
- `blacksmith.roundMvpScore` — `{ actorId, actorUuid, score, rank, name }` per round, after the Party Breakdown is generated.

No explicit teardown runs when tracking is disabled, so consumers should remove their own listeners if they stop caring.
