# Blacksmith Stats API

This document serves as the authoritative reference for the Coffee Pub Blacksmith statistics surface. It explains how the API is exposed, which namespaces are available, and how data flows through the round, combat, and lifetime tiers.

---

## Overview

Blacksmith publishes a global `BlacksmithStats` helper (installed by the API bridge) that becomes available once the module finishes initializing. The stats engine only activates on GM clients when the `trackCombatStats` and `trackPlayerStats` world settings are enabled. Consumers should wait for the Foundry `ready` hook—or call `BlacksmithAPI.waitForReady()`—before interacting with the API. The implementation targets Foundry VTT v12 while maintaining compatibility plans for v13.

---

## Architecture & Data Tiers

The stats system splits responsibilities across multiple scopes:

- **Round scope (`CombatStats.currentStats`)**: ephemeral data for the active round, stored in memory and mirrored to the combat flag. It resets when a new round begins.
- **Combat scope (`CombatStats.combatStats`)**: cumulative values for the current combat, including notable moments and per-participant totals. It is cleared when combat concludes after the summary is generated and saved.
- **Lifetime scope (`CPBPlayerStats` on actor flags)**: permanent per-actor records covering attacks, healing, and turn metrics. Only GMs modify this data.
- **Session scope (`CPBPlayerStats._sessionStats`)**: GM-only in-memory Map keyed by actor ID to hold transient session information (pending attacks, current combat turns). Reset on world reload.
- **Bounded arrays**: `_boundedPush` applies limits (default 1000 entries) to round and actor logs. The persisted combat history stored in the `combatHistory` world setting keeps only the newest twenty summaries.

---

## Namespaces & Surface Summary

`BlacksmithStats` exposes several namespaces:

- **player**: asynchronous helpers for actor-based statistics, including lifetime retrieval and category lookups.
- **combat**: synchronous helpers that reveal current combat state, historical summaries, and subscription utilities.
- **utils**: passthrough utilities (`formatTime`, `isPlayerCharacter`) shared with UI components.
- **CombatStats**: direct class access for advanced integrations; use higher-level helpers whenever possible.

---

## Player Namespace

- `getStats(actorId: string) -> Promise<object | null>` returns the full stats structure stored on the actor flag, initializing missing data when necessary.
- `getLifetimeStats(actorId: string) -> Promise<object | null>` extracts only the `stats.lifetime` segment.
- `getSessionStats(actorId: string) -> object` returns the GM-only in-memory session record (combats array, turns, pending attacks).
- `getStatCategory(actorId: string, category: string) -> Promise<object | null>` resolves an individual lifetime category such as `attacks`, `healing`, or `turnStats`.

Lifetime data persists on the actor flag, while session data remains transient in `_sessionStats`. External consumers should treat returned objects as read-only unless coordinating changes with the Blacksmith maintainers.

### Commands & Examples

```javascript
// Console (GM): inspect full stats for the first selected token's actor
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    const stats = await BlacksmithStats.player.getStats(actor.id);
    console.log('Full stats', actor.name, stats);
}
```

```javascript
// Fetch only lifetime attack totals for the controlled actor
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    const lifetime = await BlacksmithStats.player.getLifetimeStats(actor.id);
    console.log('Lifetime attacks', lifetime?.attacks);
}
```

```javascript
// Session snapshot for active actor (GM only, returns synchronously)
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    const session = BlacksmithStats.player.getSessionStats(actor.id);
    console.log('Session data', session);
}
```

```javascript
// Pull a specific lifetime category, such as healing totals
const actor = canvas.tokens.controlled[0]?.actor;
if (actor) {
    const healing = await BlacksmithStats.player.getStatCategory(actor.id, 'healing');
    console.log('Lifetime healing', healing);
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

When combat ends, `CombatStats._onCombatEnd` emits `Hooks.callAll('blacksmith.combatSummaryReady', combatSummary, combat)` so external modules can react without polling the API.

### Commands & Examples

```javascript
// Console: view the active round stats snapshot
const current = BlacksmithStats.combat.getCurrentStats();
console.log('Current round stats', current);
```

```javascript
// Grab notable moments (largest hit/heal, fastest turn, etc.)
const highlights = BlacksmithStats.combat.getNotableMoments();
console.log('Notable moments', highlights);
```

```javascript
// Inspect a specific participant by combatant ID (e.g., selected token)
const combatant = game.combat?.combatant;
if (combatant) {
    const participant = BlacksmithStats.combat.getParticipantStats(combatant.id);
    console.log('Participant summary', participant);
}
```

```javascript
// Pull the round summary for round 3, or default to current round when omitted
const roundSummary = BlacksmithStats.combat.getRoundSummary(3);
console.log('Round 3 summary', roundSummary);
```

```javascript
// Subscribe to updates and capture the subscription key
const subId = BlacksmithStats.combat.subscribeToUpdates(payload => {
    console.log('Combat stats updated', payload);
});

// Later in the same console session, remove the subscription
BlacksmithStats.combat.unsubscribeFromUpdates(subId);
```

```javascript
// View the most recent combat summary stored in history
const latestSummary = BlacksmithStats.combat.getCombatSummary();
console.log('Latest combat summary', latestSummary);
```

```javascript
// List the three most recent combat summaries with metadata only
const recent = BlacksmithStats.combat.getCombatHistory(3);
console.log('Recent combat summaries', recent.map(s => ({ combatId: s.combatId, hitRate: s.totals?.hitRate })));
```

---

## Utilities & Direct Access

- `BlacksmithStats.utils.formatTime(ms: number) -> string` formats durations for display.
- `BlacksmithStats.utils.isPlayerCharacter(target) -> boolean` determines whether a combatant, token, actor, or ID belongs to a player.
- `BlacksmithStats.CombatStats` exposes the full class for advanced use. Treat its static state as internal; avoid external mutation unless working directly with the core maintainers.

### Commands & Examples

```javascript
// Format 72 seconds into the display string used by Blacksmith UI
BlacksmithStats.utils.formatTime(72000);
```

```javascript
// Check if the currently selected token belongs to a player
const token = canvas.tokens.controlled[0];
if (token) {
    const isPlayer = BlacksmithStats.utils.isPlayerCharacter(token);
    console.log(token.name, 'is player controlled?', isPlayer);
}
```

```javascript
// Advanced: access the raw CombatStats class (read-only unless coordinated)
const CombatStatsClass = BlacksmithStats.CombatStats;
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

- Combat flags are cleared at the end of combat (`combat.unsetFlag(MODULE.ID, 'combatStats')`) to avoid stale values.
- Guard checks (`game.combats.has(combat.id)`) prevent operations on deleted combats.
- `_boundedPush` limits hit, miss, and turn arrays to safeguard against unbounded growth.
- The `combatHistory` world setting stores only the newest twenty combat summaries; modules needing long-term archives should persist their own copies.
- `CPBPlayerStats.pendingAttacks` uses a Map keyed by random IDs to correlate attack and damage rolls. Entries are intentionally short-lived.

---

## Debugging & Instrumentation

Stats logging relies on `postConsoleAndNotification(MODULE.NAME, message, payload, /*debug=*/true, /*notify=*/false)` so messages respect the module’s debug flag. Critical errors, such as storage failures, log with `debug = false` to surface regardless of debug settings. Combat summaries log with the `COMBAT SUMMARY` prefix when combats conclude; filter the console by that phrase to inspect payloads quickly.

---

## Integration Patterns

```javascript
// Wait for Blacksmith to be ready, then access stats
Hooks.once('ready', async () => {
    const stats = BlacksmithStats; // exposed by the bridge once ready

    // Listen for end-of-combat summaries without polling
    Hooks.on('blacksmith.combatSummaryReady', (summary, combat) => {
        const mvp = summary?.notableMoments?.mvp;
        if (mvp) {
            console.log('MVP recorded:', { combatId: summary.combatId, mvp });
        }
    });

    // Pull lifetime actor stats (requires GM)
    const actorId = 'ABC123';
    const lifetime = await stats.player.getLifetimeStats(actorId);
    console.log('Lifetime attack totals:', lifetime?.attacks?.totalHits);

    // Inspect recent combat summary
    const recentSummary = stats.combat.getCombatSummary();
    console.log('Most recent combat hit rate:', recentSummary?.totals?.hitRate);
});
```

---

## Version & Compatibility Notes

- `trackCombatStats` enables combat tracking; `trackPlayerStats` enables lifetime tracking. If a setting is disabled, methods return defaults or `null` rather than throwing errors.
- Only GMs mutate statistics; player clients receive read-only snapshots when available.
- Hook usage and flag management remain compatible with the Foundry v13 API roadmap. Monitor release notes for additional changes.

---

## Updating `api-core.md`

The Stats API section in `api-core.md` should remain a short summary that links directly to this document. This keeps `api-core.md` focused on high-level integration while `api-stats.md` provides the detailed reference for maintainers and external consumers.
