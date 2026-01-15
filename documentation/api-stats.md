# Blacksmith Stats API

This document serves as the authoritative reference for the Coffee Pub Blacksmith statistics surface. It explains how the API is exposed, which namespaces are available, and how data flows through the round, combat, and lifetime tiers.

---

## Overview

Blacksmith exposes its stats surface via the module API:

```javascript
// Console or module integration code:
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
```

The stats engine only activates on GM clients when the `trackCombatStats` and `trackPlayerStats` world settings are enabled. Consumers should wait for the Foundry `ready` hook before interacting with the API. The implementation requires Foundry VTT v13 or later.

---

## Architecture & Data Tiers

The stats system splits responsibilities across multiple scopes:

- **Round scope (`CombatStats.currentStats`)**: ephemeral data for the active round, stored in memory and mirrored to the combat flag. It resets when a new round begins.
- **Combat scope (`CombatStats.combatStats`)**: aggregate-only data for the active combat. Totals live in `combatStats.totals` (damage, healing, attack counts) alongside per-participant summaries and top moment highlights. Raw event arrays are discarded when the summary is generated.
- **Lifetime scope (`CPBPlayerStats` on actor flags)**: permanent per-actor records covering attacks, healing, and turn metrics. Only GMs modify this data.
- **Session scope (`CPBPlayerStats._sessionStats`)**: GM-only in-memory Map keyed by actor ID to hold transient session information (combat tracking, current combat turns). Reset on world reload.
- **Bounded arrays**: `_boundedPush` applies limits (default 1000 entries) to round and actor logs. The persisted combat history stored in the `combatHistory` world setting keeps only the newest twenty summaries.

---

## Namespaces & Surface Summary

`Stats` (from `game.modules.get('coffee-pub-blacksmith')?.api?.stats`) exposes several namespaces:

- **player**: asynchronous helpers for actor-based statistics, including lifetime retrieval and category lookups.
- **combat**: synchronous helpers that reveal current combat state, historical summaries, and subscription utilities.
- **utils**: passthrough utilities (`formatTime`, `isPlayerCharacter`) shared with UI components.
- **CombatStats**: direct class access for advanced integrations; use higher-level helpers whenever possible.

---

## Player Namespace

- `getStats(actorId: string) -> Promise<object | null>` returns the full stats structure stored on the actor flag, initializing missing data when necessary.
- `getLifetimeStats(actorId: string) -> Promise<object | null>` extracts only the `stats.lifetime` segment.
- `getSessionStats(actorId: string) -> object` returns the GM-only in-memory session record (combats array, combat tracking, current combat state).
- `getStatCategory(actorId: string, category: string) -> Promise<object | null>` resolves an individual lifetime category such as `attacks`, `healing`, or `turnStats`.

Lifetime data persists on the actor flag, while session data remains transient in `_sessionStats`. External consumers should treat returned objects as read-only unless coordinating changes with the Blacksmith maintainers.

Player-facing aggregates such as `totalHits`, `totalMisses`, `criticals`, and `fumbles` are now updated when the module receives the `blacksmith.combatSummaryReady` event. Session storage keeps a bounded `combats` array so custom UIs can display recent combat contributions without rehydrating the entire history. Lifetime data also records cumulative MVP performance (`mvp.totalScore`, `mvp.averageScore`, `mvp.highScore`, `mvp.combats`, `mvp.lastScore`, `mvp.lastRank`) so you can present long-term rankings across server restarts.

### Commands & Examples

```javascript
// Console (GM): inspect full stats for the first selected token's actor
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const actor = canvas.tokens.controlled[0]?.actor;
if (Stats && actor) {
    const stats = await Stats.player.getStats(actor.id);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Full stats', { actor: actor.name, stats }, false, false);
}
```

```javascript
// Fetch only lifetime attack totals for the controlled actor
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const actor = canvas.tokens.controlled[0]?.actor;
if (Stats && actor) {
    const lifetime = await Stats.player.getLifetimeStats(actor.id);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Lifetime attacks', lifetime?.attacks, false, false);
}
```

```javascript
// Session snapshot for active actor (GM only, returns synchronously)
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const actor = canvas.tokens.controlled[0]?.actor;
if (Stats && actor) {
    const session = Stats.player.getSessionStats(actor.id);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Session data', session, false, false);
}
```

```javascript
// Show the last recorded combats for the actor (updated via combat summaries)
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const actor = canvas.tokens.controlled[0]?.actor;
if (Stats && actor) {
    const session = Stats.player.getSessionStats(actor.id);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Recent combats', session?.combats ?? [], false, false);
    // Also display as table for easier reading
    console.table(session?.combats ?? []);
}
```

```javascript
// Pull a specific lifetime category, such as healing totals
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const actor = canvas.tokens.controlled[0]?.actor;
if (Stats && actor) {
    const healing = await Stats.player.getStatCategory(actor.id, 'healing');
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Lifetime healing', healing, false, false);
}
```

```javascript
// Inspect lifetime MVP performance for the actor
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
if (actor) {
    const stats = await Stats.player.getStats(actor.id);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Lifetime MVP totals', stats?.lifetime?.mvp, false, false);
}
```

---

## Combat Namespace

- `getCurrentStats() -> object` exposes the active round snapshot, falling back to defaults if tracking has not yet started.
- `getParticipantStats(participantId: string) -> object | null` provides per-participant round information when available.
- `getNotableMoments() -> object | null` surfaces current-round highlights.
- `getRoundSummary(round?: number) -> object | null` returns an aggregate entry from `combatStats.rounds`, defaulting to the live combat round.
- `subscribeToUpdates(callback: Function) -> string` registers a callback with the internal subscriber set. The current implementation issues a synthetic ID but does not track IDs individually; `unsubscribeFromUpdates` clears the entire set.
- `unsubscribeFromUpdates(subscriptionId: string)` clears all subscribers. Future refactors may support per-ID removal, so integrations should handle that change gracefully.
- `getCombatSummary() -> object | null` returns the newest persisted combat summary.
- `getCombatHistory(limit = 20) -> Array<object>` returns a newest-first slice of stored summaries. The history is bounded to twenty entries when written.

Summaries expose a consistent schema: `totals.damage`, `totals.healing`, and `totals.attacks` (attempts, hits, misses, crits, fumbles) plus `participants[]` entries that mirror those counts per actor. Consumers no longer receive the raw hit/miss arrays; use the aggregate fields for analytics and the `notableMoments` block for highlights. The `notableMoments` bundle now includes `mvpRankings`—a descending list of per-actor MVP scores (same formula used in the Party Breakdown)—alongside the top MVP entry.

**Combat summary totals (current schema)**:
- `totals.hits`, `totals.misses`, `totals.totalAttacks`, `totals.hitRate`
- `totals.damageDealt`, `totals.damageTaken`, `totals.healingGiven`
- `totals.criticals`, `totals.fumbles`

**Policy guardrails**:
- Totals include all damage/healing buckets (including `other` / `unlinked` where applicable).
- “Top hits / Biggest hit / Weakest hit” moments are **onHit-only**.
- Party-wide totals are computed from **player characters only** (participants may include NPCs for context/moments).

When combat ends, `CombatStats._onCombatEnd` emits `Hooks.callAll('blacksmith.combatSummaryReady', combatSummary, combat)` so external modules can react without polling the API. During each round, `Hooks.callAll('blacksmith.roundMvpScore', { actorId, actorUuid, score, rank, name })` fires after the Party Breakdown is generated, which you can use to track per-round leaderboards or persist MVP progress mid-combat.

### Commands & Examples

```javascript
// Console: view the active round stats snapshot
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const current = Stats?.combat.getCurrentStats();
console.log('Current round stats', current);
```

```javascript
// Grab notable moments (largest hit/heal, fastest turn, etc.)
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const highlights = Stats?.combat.getNotableMoments();
console.log('Notable moments', highlights);
```

```javascript
// Inspect a specific participant by combatant ID (e.g., selected token)
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const combatant = game.combat?.combatant;
if (Stats && combatant) {
    const participant = Stats.combat.getParticipantStats(combatant.id);
    console.log('Participant summary', participant);
}
```

```javascript
// Pull the round summary for round 3, or default to current round when omitted
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const roundSummary = Stats?.combat.getRoundSummary(3);
console.log('Round 3 summary', roundSummary);
```

```javascript
// Subscribe to updates and capture the subscription key
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const subId = Stats?.combat.subscribeToUpdates(payload => {
    console.log('Combat stats updated', payload);
});

// Later in the same console session, remove the subscription
Stats?.combat.unsubscribeFromUpdates(subId);
```

```javascript
// View the most recent combat summary stored in history
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const latestSummary = Stats?.combat.getCombatSummary();
console.log('Latest combat summary totals', {
    damage: latestSummary?.totals?.damageDealt,
    healing: latestSummary?.totals?.healingGiven,
    attacks: latestSummary?.totals?.attacks
});
```

```javascript
// List the three most recent combat summaries with metadata only
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const recent = Stats?.combat.getCombatHistory(3);
console.log('Recent combat summaries', recent.map(s => ({
    combatId: s.combatId,
    hitRate: s.totals?.hitRate,
    topCrits: s.participants?.map(p => ({ actorId: p.actorId, crits: p.criticals })),
    mvpRankings: s.notableMoments?.mvpRankings
})));
```

```javascript
// Inspect MVP rankings for the latest combat
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const rankings = Stats?.combat.getCombatSummary()?.notableMoments?.mvpRankings ?? [];
console.table(rankings.map((r, index) => ({ rank: index + 1, name: r.name, score: r.score })));
```

---

## Utilities & Direct Access

- `Stats.utils.formatTime(ms: number) -> string` formats durations for display.
- `Stats.utils.isPlayerCharacter(target) -> boolean` determines whether a combatant, token, actor, or ID belongs to a player.
- `Stats.CombatStats` exposes the full class for advanced use. Treat its static state as internal; avoid external mutation unless working directly with the core maintainers.

### Commands & Examples

```javascript
// Format 72 seconds into the display string used by Blacksmith UI
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
Stats?.utils.formatTime(72000);
```

```javascript
// Check if the currently selected token belongs to a player
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const token = canvas.tokens.controlled[0];
if (token) {
    const isPlayer = Stats?.utils.isPlayerCharacter(token);
    console.log(token.name, 'is player controlled?', isPlayer);
}
```

```javascript
// Advanced: access the raw CombatStats class (read-only unless coordinated)
const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;
const CombatStatsClass = Stats?.CombatStats;
console.log('Current combat totals', CombatStatsClass.combatStats?.totals);
```

---

## Event Flow & Lifecycle

1. `CombatStats.initialize()` runs for GMs when combat tracking is enabled. It clones defaults, registers Handlebars helpers, and hooks into combat and system events via `HookManager`.
2. Player tracking initializes when lifetime tracking is enabled, adding hooks for attack rolls, damage rolls, combat lifecycle events, and actor updates.
3. `_onUpdateCombat` responds to round and turn transitions. `_onRoundEnd` rolls up round data and resets `currentStats`; `_onRoundStart` prepares the next round and refreshes flags.
4. `_onCombatEnd` guards against deleted combats, generates the summary, logs it via `postConsoleAndNotification`, fires the `blacksmith.combatSummaryReady` hook, persists the bounded history, and clears transient structures.
5. Player turn processing (`_processTurnStart`, `_processTurnEnd`) updates session maps and actor lifetime stats, applying bounded arrays to prevent growth issues.
6. Disabling tracking or unloading the module stops new data from being collected. No explicit teardown runs today, so integrations using `subscribeToUpdates` should clear their subscriptions when tracking toggles off.

---

## Data Retention & Safeguards

- Combat aggregates reset as soon as the summary is generated: `combatStats.totals` and `combatStats.participantStats` are reinitialized for the next combat, so no combat-level flags remain in the world data.
- Guard checks (`game.combats.has(combat.id)`) prevent operations on deleted combats.
- `_boundedPush` limits hit, miss, and turn arrays to safeguard against unbounded growth.
- The `combatHistory` world setting stores only the newest twenty combat summaries; modules needing long-term archives should persist their own copies.
- Attack/damage correlation is now handled via chat message resolution (`createChatMessage` hook) using stable keying (attacker actor, item UUID, activity UUID, sorted target UUIDs). Lifetime counters update when `blacksmith.combatSummaryReady` fires.

---

## Debugging & Instrumentation

Stats logging relies on `postConsoleAndNotification(MODULE.NAME, message, payload, /*debug=*/true, /*notify=*/false)` so messages respect the module’s debug flag. Critical errors, such as storage failures, log with `debug = false` to surface regardless of debug settings. Combat summaries log with the `COMBAT SUMMARY` prefix when combats conclude; filter the console by that phrase to inspect payloads quickly.

---

## Integration Patterns

```javascript
// Wait for Blacksmith to be ready, then access stats
Hooks.once('ready', async () => {
    const Stats = game.modules.get('coffee-pub-blacksmith')?.api?.stats;

    // Listen for end-of-combat summaries without polling
    Hooks.on('blacksmith.combatSummaryReady', (summary, combat) => {
        const mvp = summary?.notableMoments?.mvp;
        if (mvp) {
            console.log('MVP recorded:', { combatId: summary.combatId, mvp });
        }
    });

    // Track round-by-round MVP progress (e.g., update a custom UI badge)
    Hooks.on('blacksmith.roundMvpScore', ({ actorId, score, rank, name }) => {
        console.log('Round MVP update:', { actorId, name, score, rank });
        // Example: store in your module's state to show a live leaderboard
    });

    // Pull lifetime actor stats (requires GM)
    const actorId = 'ABC123';
    const lifetime = await Stats?.player.getLifetimeStats(actorId);
    BlacksmithUtils.postConsoleAndNotification('BLACKSMITH', 'Player Stats | Lifetime attack totals', lifetime?.attacks?.totalHits, false, false);

    // Inspect recent combat summary
    const recentSummary = Stats?.combat.getCombatSummary();
    console.log('Most recent combat hit rate:', recentSummary?.totals?.hitRate);
});
```
```

---

## Version & Compatibility Notes

- `trackCombatStats` enables combat tracking; `trackPlayerStats` enables lifetime tracking. If a setting is disabled, methods return defaults or `null` rather than throwing errors.
- Only GMs mutate statistics; player clients receive read-only snapshots when available.
- This module requires Foundry VTT v13 or later. Hook usage and flag management follow the Foundry v13 API.

---

## Updating `api-core.md`

The Stats API section in `api-core.md` should remain a short summary that links directly to this document. This keeps `api-core.md` focused on high-level integration while `api-stats.md` provides the detailed reference for maintainers and external consumers.
