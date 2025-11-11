# Stats System Architecture

## Overview

This document outlines the current state and proposed architecture for the Coffee Pub Blacksmith statistics tracking system. The system tracks combat statistics at three levels: round-by-round, per-combat, and lifetime player stats.

---

## Current System Analysis

### Files Involved

1. `scripts/stats-combat.js` - Round and combat statistics
2. `scripts/stats-player.js` - Player lifetime statistics and combat flags
3. `scripts/timer-round.js` - Round duration tracking

---

## Current Implementation

### 1. stats-combat.js - Round & Combat Stats

#### Data Structures

**currentStats (roundStats)** - Reset each round
- `hits[]` - Array of hit events for current round
- `misses[]` - Array of miss events for current round
- `expiredTurns[]` - Array of turns that exceeded time limit
- `participantStats{}` - Per-actor combat data for current round
- `partyStats` - Aggregated party metrics (hits, misses, damage, healing)
- `notableMoments` - Biggest hit, most damage, longest turn, etc.
- Timing data: `roundStartTime`, `planningStartTime`, `activeRoundTime`, etc.

**combatStats** - Persists entire combat (now aggregate-only)
- `totals` - Aggregate damage, healing, and attack counts (hits, misses, crits, fumbles, attempts)
- `rounds[]` - Stores summary of each round (capped at 1000)
- `participantStats{}` - Per-actor cumulative stats (totals only, no raw event arrays)
- `topHits[]`, `topHeals[]` - Highlight reels kept to top N (bounded)
- `longestTurn`, `fastestTurn` - Combat-wide records

#### Lifecycle

- **Round Start** (`_onRoundStart`): Initializes fresh `currentStats`
- **Round End** (`_onRoundEnd`): 
  - Generates round summary
  - Posts to chat
  - Pushes round summary to `combatStats.rounds[]`
  - Resets `currentStats`
- **Combat End** (`_onCombatEnd`): 
  - Logs stats to console
  - **Resets both `currentStats` and `combatStats`**
  - **NO PERSISTENCE** - all combat data is lost

#### Issues

- Combat-level stats are logged but not saved anywhere permanent
- Arrays grow to 1000 items during long combats
- *(Resolved in Phase 2)* `combatStats.hits[]` and `combatStats.misses[]` previously accumulated full event objects across all rounds; these are now replaced by aggregate counters.
- Per-actor `participantStats[actorId].hits[]` arrays also grow unbounded (up to 1000)
- `combatStats.hits[]` - **REMOVED**; replaced by aggregated counters in `combatStats.totals`
- `combatStats.misses[]` - **REMOVED**; aggregate counts live in `combatStats.totals.attacks.misses`

---

### 2. stats-player.js - Lifetime & Combat Flag Stats

#### Data Structures

**CPB_STATS_DEFAULTS.lifetime** - Stored in actor flags permanently
- `attacks.biggest` - Best hit ever
- `attacks.weakest` - Weakest hit ever
- `attacks.hitLog[]` - Last 20 hits
- `attacks.totalHits`, `attacks.totalDamage`, `attacks.criticals`, `attacks.fumbles`
- `attacks.damageByWeapon{}`, `attacks.damageByType{}`
- `healing.total`, `healing.received`
- `turnStats` - average, fastest, slowest turn times

**_sessionStats** - In-memory Map (temporary)
- `pendingAttacks` - Matches attack rolls to damage rolls
- `currentCombat.turns[]` - Turn timing data (uses `_boundedPush`, max 1000)

**Combat Flags** - `combat.setFlag(MODULE.ID, 'combatStats')`
- Stored in Foundry database on combat document
- `hits[]` - **GROWS UNBOUNDED** during combat (uses `_boundedPush`, max 1000)
- `healing[]` - **GROWS UNBOUNDED** (uses `_boundedPush`, max 1000)
- `participants[actorId].hits[]` - **GROWS UNBOUNDED** per actor (uses `_boundedPush`, max 1000)
- `participants[actorId].damage`, `participants[actorId].healing`

#### Lifecycle

- **Combat Start** (`_onCombatStart`): Initializes combat flags
- **During Combat**: 
  - Updates lifetime stats on actor flags
  - Stores detailed events in combat flags
  - Tracks pending attacks in session memory
- **Combat End** (`_onCombatEnd`): 
  - Calculates summary stats
  - **CLEARS combat flag** with `combat.unsetFlag()`
  - Summary stats are calculated but not saved

#### Issues

- Combat flags cleared at end means no combat-level summary is saved
- Only lifetime aggregated stats persist
- No combat-by-combat history
- Redundant tracking with `stats-combat.js`

---

### 3. timer-round.js - Round Duration Tracking

#### Data Structures

**Combat Flags**
- `stats.roundStartTimestamp` - When current round started
- `stats.accumulatedTime` - Time accumulated when window loses focus
- `totalCombatDuration` - Cumulative duration across all rounds

#### Lifecycle

- Tracks wall-clock time for current round and total combat
- Updates display every second via `setInterval`
- Resets round timer on round change
- Accumulates into `totalCombatDuration`

#### Issues

- These timing flags are **never explicitly cleared**
- They persist in combat document after combat ends
- Could accumulate if combat document is reused

---

## Key Issues Summary

### Memory/Storage Issues

1. **Bounded but large arrays**: All arrays capped at 1000 items, which is reasonable but could still accumulate ~1000 objects × multiple arrays during long combat
2. **Combat flags not cleaned up**: `timer-round.js` flags (`stats`, `totalCombatDuration`) are never cleared
3. **Redundant tracking**: Both `stats-combat.js` and `stats-player.js` track hits/damage independently

### Functional Issues

4. **No combat summary persistence**: `stats-combat.js` resets everything at combat end without saving
5. **Combat flag cleared too early**: `stats-player.js` clears combat flag at end, losing detailed combat data
6. **No combat history**: Lifetime stats are aggregated totals only - no "last 10 combats" or combat-by-combat breakdown

### Architectural Issues

7. **Dual tracking systems**: `stats-combat.js` (for round summaries) and `stats-player.js` (for lifetime) track overlapping data
8. **Unclear ownership**: Who owns combat-level stats? Currently neither file saves them permanently
9. **Event arrays vs summaries**: Storing full event arrays when only aggregates are needed

---

## Proposed Architecture

### Three-Tier System

#### Tier 1: Round Stats (Ephemeral)

- **Location**: `stats-combat.js` → `currentStats`
- **Lifespan**: Current round only
- **Purpose**: Generate round summary chat cards
- **Storage**: In-memory only, reset each round
- **Data**: Detailed per-event arrays for current round only
  - `hits[]`, `misses[]`, `expiredTurns[]`
  - `participantStats{}` with full detail
  - `notableMoments` for the round
  - Timing data for the round

**Rationale**: Round summaries need detailed data to generate interesting chat cards. This data is only needed temporarily and can be discarded after the round summary is posted.

---

#### Tier 2: Combat Stats (Per-Combat Summary)

- **Location**: NEW - Combat summary saved at combat end
- **Lifespan**: Permanent record of each combat
- **Purpose**: Post-combat review, combat history, session recaps
- **Storage**: TBD (see questions below)
  - Option A: Combat document flags
  - Option B: Journal entry
  - Option C: World flags
- **Data**: Combat summary only (NO event arrays)
  - Combat metadata: duration, rounds, scene, date
  - Participant summaries: name, total damage dealt/taken, total healing, hit count
  - Notable moments: biggest hit, MVP, fastest turn
  - Round count and average round time
  - **NO detailed event arrays** - just aggregated totals

**Rationale**: We want a record of each combat for review and history, but we don't need every individual hit stored permanently. Summary data is sufficient and much more memory-efficient.

---

#### Tier 3: Lifetime Stats (Aggregate)

- **Location**: `stats-player.js` → actor flags
- **Lifespan**: Permanent, entire campaign
- **Purpose**: Character progression tracking, achievements
- **Storage**: Actor document flags
- **Data**: Aggregated totals and records
  - Total hits, total damage, criticals, fumbles
  - Biggest hit ever, weakest hit ever
  - Last 20 hits (bounded)
  - Damage by weapon, damage by type
  - Turn time averages
  - Total healing given/received

**Rationale**: Players want to see their character's progression over time. Lifetime stats provide this without storing every combat in detail.

---

## Proposed Changes

### What to Keep

- ✅ Round summaries to chat (working well)
- ✅ Lifetime stats on actors (working well)
- ✅ `_boundedPush` helper (good safety mechanism)
- ✅ Notable moments tracking (biggest hit, MVP, etc.)
- ✅ Round timing system

### What to Add

- **Combat summary persistence**: Save combat summary at combat end
  - Duration, rounds, scene name, date
  - Participant summaries (totals only, no event arrays)
  - Notable moments from the combat
  - Round count and timing
  - Store in TBD location (see questions)

- **Combat history**: Maintain list of recent combats
  - Keep last N combat summaries (e.g., 10-20)
  - Oldest combats automatically pruned
  - Accessible via API for review

- **Cleanup on combat end**: Ensure all temporary flags are cleared
  - Timer flags from `timer-round.js`
  - Temporary combat flags
  - Session data

### What to Remove/Consolidate

**IMPORTANT CLARIFICATION**: The removals below target **combat-level** data (`combatStats`), NOT **round-level** data (`currentStats`). 

- **Round summaries will NOT be affected**: The end-of-round report uses `currentStats` (round-level data) which is **preserved**. Round summaries use `currentStats.hits[]`, `currentStats.misses[]`, `currentStats.participantStats[]`, and `currentStats.notableMoments` - none of these are being removed.

- **Only combat-level arrays are gone**: Phase 2 replaced the old `combatStats.hits[]`, `combatStats.misses[]`, etc., with aggregate counters. Round summaries still rely on `currentStats.hits[]`, so nothing about end-of-round reporting changed.

**Removals**:
- ❌ `combatStats.hits[]` - Don't need full array, just count (round summaries use `currentStats.hits[]` instead)
- ❌ `combatStats.misses[]` - Don't need full array, just count (round summaries use `currentStats.misses[]` instead)
- ❌ `combatStats.participantStats[].hits[]` - Don't need per-actor arrays, just totals (round summaries use `currentStats.participantStats[]` instead)
- ❌ Redundant tracking between `stats-combat.js` and `stats-player.js`
- ❌ Combat flag detailed event arrays in `stats-player.js`

**What's NOT being removed (used for round summaries)**:
- ✅ `currentStats.hits[]` - Preserved for round summary generation
- ✅ `currentStats.misses[]` - Preserved for round summary generation
- ✅ `currentStats.participantStats[]` - Preserved for round summary generation
- ✅ `currentStats.notableMoments` - Preserved for round summary generation
- ✅ `currentStats.partyStats` - Preserved for round summary generation

### What to Refactor

- **Consolidate hit/damage tracking**: Single source of truth
  - `stats-combat.js` owns round and combat tracking
  - `stats-player.js` consumes combat summary at end to update lifetime stats
  - No dual tracking during combat

- **Clear separation of concerns**:
  - `stats-combat.js`: Round summaries + combat summaries
  - `stats-player.js`: Lifetime stats only
  - `timer-round.js`: Timing only (no stats)

---

## Data Retention Policy

### Three Levels of History

#### 1. Round Data (Ephemeral)
- **Retention**: Discard immediately after round summary is posted to chat
- **Lifecycle**:
  - Accumulates during round (in `currentStats`)
  - Used to generate round summary at round end
  - Posted to chat
  - **DISCARDED** - `currentStats` reset, arrays cleared
- **Storage**: In-memory only (`stats-combat.js` → `currentStats`)
- **Rationale**: Round summaries are ephemeral - once posted, detailed event arrays are no longer needed

#### 2. Combat Data (Temporary)
- **Retention**: Discard after lifetime stats are updated and combat summary is reported
- **Lifecycle**:
  - Accumulates during combat (in `combatStats` and combat flags)
  - At combat end:
    1. Generate combat summary
    2. Report combat summary (chat, console, etc.)
    3. Update lifetime stats from combat summary
    4. **DISCARDED** - all combat-level data cleared
- **Storage**: In-memory during combat (`stats-combat.js` → `combatStats`)
- **Rationale**: Combat-level data is only needed long enough to create the summary and update lifetime stats. After that, it's redundant and should be discarded.

#### 3. Lifetime Data (Permanent)
- **Retention**: Permanent - retained for the life of the character/campaign
- **Lifecycle**:
  - Accumulated from all combats
  - Updated at combat end from combat summary
  - Never discarded (except by user action)
- **Storage**: Actor document flags (`stats-player.js` → `actor.flags[MODULE.ID].playerStats`)
- **Rationale**: Lifetime stats track character progression over the entire campaign. These need to be:
  - **Accessible** for real-time queries (e.g., checking if new hit is a "biggest hit")
  - **Permanent** for character progression tracking
  - **Efficient** for frequent access (stats cards, achievement checking, etc.)

### Key Principle: Discard After Use

The core principle is: **Store data only as long as it's needed for a specific purpose, then discard it.**

- **Round data**: Needed for round summary → discard after summary posted
- **Combat data**: Needed for combat summary + lifetime update → discard after both complete
- **Lifetime data**: Needed for permanent tracking → never discard (unless user deletes)

---

## Storage Options Analysis

### 1. Combat History Storage (Combat Summaries)

**IMPORTANT**: Based on the data retention policy above, we **DON'T need to store combat summaries permanently**. Combat data should be discarded after:
1. Combat summary is generated and reported
2. Lifetime stats are updated from the summary

However, if we want to keep combat summaries for review (optional feature), here are the options:

#### Option A: Combat Document Flags
- **Storage**: `combat.setFlag(MODULE.ID, 'combatSummary', {...})`
- **Lifespan**: Exists as long as combat document exists
- **Pros**:
  - ✅ Keeps data with combat (logical grouping)
  - ✅ Simple implementation (just a flag set)
  - ✅ Automatically available when viewing combat
- **Cons**:
  - ❌ **Lost if combat is deleted** (major issue)
  - ❌ **Not easily queryable** across combats (must iterate all combats)
  - ❌ **Doesn't survive module reload** if combat is temporary
- **Use Case**: Only if combat summaries are truly temporary (deleted with combat)

#### Option B: Journal Entry
- **Storage**: Create a JournalEntry with formatted combat summary
- **Lifespan**: Permanent until manually deleted
- **Pros**:
  - ✅ **Permanent** - survives combat deletion and module reloads
  - ✅ **Searchable** - Foundry's journal search works
  - ✅ **Shareable** - Players can view journal entries
  - ✅ **Formatted** - Can create nice HTML display
  - ✅ **Discoverable** - Visible in journal sidebar
- **Cons**:
  - ❌ **More complex** - Must create/manage journal entries
  - ❌ **Journal clutter** - Creates many entries over time
  - ❌ **Not efficient** - Not optimized for programmatic queries
  - ❌ **UI overhead** - Players might see combat summaries they don't want
- **Use Case**: If we want a readable, shareable combat log for players/GMs

#### Option C: World Flags
- **Storage**: `game.settings.set(MODULE.ID, 'combatHistory', [...])` or `game.settings.set(MODULE.ID, 'combatSummaries', {...})`
- **Lifespan**: Permanent, part of world data
- **Pros**:
  - ✅ **Simple** - Just a settings object/array
  - ✅ **Permanent** - Part of world save data
  - ✅ **Efficient** - Easy to query programmatically
  - ✅ **No UI clutter** - Hidden from players (can build custom UI later)
  - ✅ **Bounded** - Easy to implement "keep last N combats" pruning
  - ✅ **Fast access** - Direct data access for stats cards, etc.
- **Cons**:
  - ❌ **Hidden from players** - Not discoverable (would need custom UI)
  - ❌ **Not shareable** - Can't easily show to players
  - ❌ **No formatting** - Raw data, no pretty display
- **Use Case**: If we want programmatic access to combat history (e.g., "show last 5 combats in stats card")

#### Recommendation

**Primary Recommendation**: **Don't store combat summaries at all** - they're not needed per the retention policy. Discard combat data after lifetime stats are updated.

**If combat summaries are desired** (optional feature):
- **Option C (World Flags)** for programmatic access and stats integration
- Optionally export to **Option B (Journal Entry)** if players want readable combat logs
- **Never use Option A** - too fragile, data loss risk

#### Implementation Approach

If we implement combat summary storage:
1. Save summary to world flags (Option C) with bounded array (keep last 10-20)
2. Provide optional setting: "Save combat summaries to journal" (Option B)
3. Automatically prune old summaries (keep only last N)
4. Provide API access for stats cards, etc.

---

### 2. Consolidation Approach

The current system has `stats-combat.js` and `stats-player.js` tracking overlapping data during combat. We need to decide how to eliminate this duplication while maintaining clear responsibilities.

#### Option A: Keep Separate with Clear Boundaries (RECOMMENDED)

**Architecture**:
- `stats-combat.js`: Owns round and combat tracking
  - Tracks all combat events during combat
  - Generates round summaries
  - Generates combat summary at combat end
  - **Does NOT** touch lifetime stats
  - **Does NOT** store in actor flags
- `stats-player.js`: Owns lifetime stats only
  - **Does NOT** track combat events during combat
  - Reads combat summary at combat end (from `stats-combat.js`)
  - Updates lifetime stats from combat summary
  - Stores only in actor flags
  - Handles lifetime stats queries (e.g., "is this a new biggest hit?")

**Data Flow**:
```
During Combat:
  Events → stats-combat.js only (round/combat tracking)

Round End:
  stats-combat.js → Generate round summary → Post to chat → Reset round data

Combat End:
  1. stats-combat.js → Generate combat summary
  2. stats-combat.js → Report combat summary (chat/console)
  3. stats-combat.js → Expose combat summary (via API or event)
  4. stats-player.js → Read combat summary
  5. stats-player.js → Update lifetime stats from summary
  6. stats-combat.js → Discard combat data (clear combatStats)
  7. stats-player.js → Clear temporary session data
```

**Pros**:
- ✅ **Clear separation of concerns** - Each file has one job
- ✅ **Single source of truth** - Only `stats-combat.js` tracks events during combat
- ✅ **Easier to maintain** - Changes to combat tracking don't affect lifetime stats
- ✅ **Easier to test** - Can test each system independently
- ✅ **Clear ownership** - No confusion about who owns what data

**Cons**:
- ❌ **Coordination needed** - Must ensure proper handoff at combat end
- ❌ **Potential timing issues** - Must ensure `stats-player.js` reads summary before it's discarded
- ❌ **API dependency** - Need clean API/event for combat summary handoff

**Implementation Details**:
1. Remove all combat event tracking from `stats-player.js` during combat
2. `stats-combat.js` exposes combat summary via:
   - Static method: `CombatStats.getCombatSummary()`
   - Or event: `blacksmith.combatSummaryReady`
3. `stats-player.js` subscribes/hooks to get combat summary at combat end
4. Clear documentation of the handoff contract

---

#### Option B: Merge into Single Stats System

**Architecture**:
- Single file `stats-manager.js` handles all stats
- Three internal tiers (round, combat, lifetime) within the file
- All tracking in one place

**Data Flow**:
```
During Combat:
  Events → stats-manager.js (tracks to round/combat tiers)

Combat End:
  stats-manager.js → Generate summaries → Update lifetime tier → Discard combat tier
```

**Pros**:
- ✅ **No duplication** - Single source of truth
- ✅ **No coordination needed** - Everything in one place
- ✅ **Atomic operations** - Combat end processing is all in one function

**Cons**:
- ❌ **Large file** - Combines ~2000 lines from both files
- ❌ **Complex** - Harder to understand responsibilities
- ❌ **Harder to maintain** - Changes affect everything
- ❌ **Less modular** - Can't easily disable lifetime stats without affecting combat stats

**Implementation Details**:
1. Merge both files into single `stats-manager.js`
2. Create internal classes/methods for each tier
3. Clear internal boundaries with comments/documentation
4. Single initialization point

---

#### Option C: Keep As-Is But Coordinate Better

**Architecture**:
- Both files continue tracking during combat
- Better coordination to avoid duplication
- Better handoff at combat end

**Pros**:
- ✅ **Minimal refactoring** - Keep existing structure
- ✅ **Less risk** - Don't change what's working

**Cons**:
- ❌ **Still redundant** - Both files tracking same events
- ❌ **Complexity remains** - Still need coordination
- ❌ **Harder to debug** - Which file owns what data?
- ❌ **Doesn't solve root issue** - Still have duplication

**Implementation Details**:
1. Keep current dual-tracking
2. Add checks to prevent duplicate processing
3. Better cleanup at combat end
4. Document which file is responsible for what

---

#### Detailed Recommendation: Option A

**Why Option A is best**:

1. **Clear Ownership**: `stats-combat.js` owns combat tracking, `stats-player.js` owns lifetime tracking. No confusion.

2. **Minimal Changes**: `stats-player.js` already reads combat flags - we just change it to read combat summary instead of tracking during combat.

3. **Eliminates Duplication**: Only `stats-combat.js` tracks events during combat. `stats-player.js` just consumes the summary.

4. **Easy to Reason About**: 
   - Round summary? `stats-combat.js`
   - Combat summary? `stats-combat.js`
   - Lifetime stats? `stats-player.js`
   - Query lifetime stats? `stats-player.js`

5. **Future-Proof**: If we want to add features (like combat history), it's clear where they belong.

**Coordination Strategy**:
- Use Foundry's hook system: `stats-combat.js` fires a hook when combat summary is ready
- `stats-player.js` listens to that hook and updates lifetime stats
- This is the standard Foundry pattern and works well

**Migration Path**:
1. Phase 1: Add combat summary generation to `stats-combat.js`
2. Phase 2: Remove event tracking from `stats-player.js`, add summary consumer
3. Phase 3: Clean up any remaining duplication
4. Phase 4: Add proper API/events for coordination

---

### 3. Array Retention - What Data to Keep

Based on the data retention policy, we need to be crisp about what we retain and what we discard.

**Key Distinction**: 
- **Round-level data** (`currentStats`) = Used for round summaries, **preserved during round, discarded after**
- **Combat-level data** (`combatStats`) = Used for combat aggregation, **can use aggregates instead of full arrays**

#### Current Problem

We're storing full event arrays in multiple places:
- `currentStats.hits[]` - **DISCARD** after round summary (correct)
- `combatStats.hits[]` - **DISCARD** after combat summary (but currently kept)
- `combatStats.misses[]` - **DISCARD** after combat summary (but currently kept)
- `combatStats.participantStats[].hits[]` - **DISCARD** after combat summary (but currently kept)
- Combat flags `hits[]`, `healing[]` - **DISCARD** after combat summary (but currently kept)
- Lifetime `hitLog[]` - **RETAIN** (limited to 20, correct)

#### What to Retain vs Discard

##### Round Data (Discard After Round Summary)
- **Keep**: Full event arrays during round (`currentStats.hits[]`, `currentStats.misses[]`)
- **Why**: Needed to generate interesting round summary (the end-of-round report uses this data)
- **Note**: This data is **NOT** being removed - it's preserved during the round and only discarded AFTER the round summary is posted to chat
- **Discard**: Everything in `currentStats` after round summary posted
- **Result**: Round summary posted to chat, all round data discarded

##### Combat Data (Discard After Combat Summary + Lifetime Update)
- **Keep During Combat**: 
  - Aggregated totals (`totalHits`, `totalDamage`, etc.)
  - Notable moments (biggest hit, MVP, fastest turn)
  - Per-participant totals (damage dealt/taken, healing, hit count)
  - Round summaries (already aggregated)
- **Discard After Combat End**:
  - All event arrays (`hits[]`, `misses[]`, `healing[]`)
  - Per-actor hit arrays (`participantStats[].hits[]`)
  - Full event objects
- **Why**: Only need aggregates for combat summary, not individual events
- **Result**: Combat summary generated, lifetime stats updated, all combat data discarded

##### Lifetime Data (Retain Forever)
- **Keep**:
  - Aggregated totals (total hits, total damage, etc.)
  - Records (biggest hit ever, weakest hit ever)
  - **Limited** event history (last 20 hits in `hitLog[]`)
  - Damage breakdowns (by weapon, by type)
  - Turn time statistics
- **Why**: Needed for character progression, achievement checking, stats cards
- **Never Discard**: Except by user action (character deletion, etc.)

#### Recommendation: Aggregates + Top N Moments (Option B)

**For Combat Summary** (temporary, discarded after lifetime update):
- Aggregated totals only:
  - Total hits, total misses, total damage dealt/taken
  - Total healing given/received
  - Hit counts per participant
  - Round count
- Top N moments (for interesting summary):
  - Top 5 biggest hits (with attacker, target, damage, weapon)
  - Top 3 biggest heals
  - Longest 3 turns
  - MVP information
- **NO full event arrays** - just summaries and highlights

**For Lifetime Stats** (permanent):
- Aggregated totals (as currently implemented)
- Records (biggest hit ever, etc.)
- Last 20 hits (bounded `hitLog[]` as currently implemented)
- Damage breakdowns
- **NO full combat event arrays** - we don't need every hit from every combat

#### Implementation Strategy

1. **During Round**: Keep full arrays in `currentStats` (needed for round summary)
2. **Round End**: Generate round summary, discard `currentStats` arrays
3. **During Combat**: In `combatStats`, track only:
   - Aggregates (counts, totals)
   - Top N moments (maintain sorted list of top hits/heals)
   - Per-participant totals
4. **Combat End**: 
   - Generate combat summary from aggregates + top moments
   - Update lifetime stats from combat summary
   - Discard all combat data (including `combatStats`)
5. **Lifetime**: Keep only aggregated totals and records (as currently implemented)

#### Key Principle: Store What's Needed, Discard What's Not

- Round summary needs: Full event arrays for current round → **Keep during round, discard after**
- Combat summary needs: Aggregates + highlights → **Keep during combat, discard after**
- Lifetime needs: Totals + records + recent history → **Keep forever**

**Bottom Line**: We should **NOT** be storing full event arrays in `combatStats` or combat flags. We only need aggregates and top N moments.

---

## Implementation Plan

### Phase 1: Add Combat Summary Persistence

1. Create combat summary structure
2. Save summary at combat end (to world flags initially)
3. Implement history management (keep last N combats)
4. Add API to retrieve combat history

### Phase 2: Cleanup and Consolidation

1. ✅ Remove event arrays from `combatStats`
2. ✅ Clear timer flags at combat end
3. ✅ Consolidate tracking to eliminate duplication
4. ✅ Update `stats-player.js` to consume combat summaries

### Phase 3: Refactor for Clarity

1. Document tier boundaries clearly
2. Refactor `stats-combat.js` for clarity
3. Add JSDoc comments
4. Update API documentation

---

## Success Criteria

- ✅ Round summaries continue to work as expected
- ✅ Combat summaries are saved and retrievable
- ✅ Lifetime stats continue to update correctly
- ✅ Memory usage is bounded and predictable
- ✅ No data loss at combat end
- ✅ All temporary flags are cleaned up
- ✅ Clear separation of concerns between files
- ✅ No redundant tracking

---

## Notes

- Current `_boundedPush` implementation caps arrays at 1000 items, which is reasonable
- The main issue is not unbounded growth but rather storing unnecessary detail
- Focus should be on storing the right data at the right level, not just limiting array sizes
- Combat summaries should be lightweight and focused on what's actually useful for review

---

## Summary: Final Architecture

### Data Retention Summary

| Data Tier | Storage Location | Retention | What's Kept | What's Discarded |
|-----------|------------------|-----------|-------------|------------------|
| **Round** | `stats-combat.js` → `currentStats` (in-memory) | Current round only | Full event arrays during round | Everything after round summary posted |
| **Combat** | `stats-combat.js` → `combatStats` (in-memory) | Entire combat, then discarded | Aggregates + top N moments | All data after combat summary + lifetime update |
| **Lifetime** | `stats-player.js` → Actor flags (permanent) | Forever | Totals, records, last 20 hits | Nothing (except by user action) |

### File Responsibilities

**stats-combat.js**:
- Owns round tracking (Tier 1)
- Owns combat tracking (Tier 2)
- Generates round summaries
- Generates combat summaries
- **Does NOT** touch lifetime stats
- **Does NOT** store in actor flags

**stats-player.js**:
- Owns lifetime tracking (Tier 3)
- Queries lifetime stats (e.g., "is this a new biggest hit?")
- Updates lifetime stats from combat summary
- **Does NOT** track combat events during combat
- Stores only in actor flags

**timer-round.js**:
- Owns round/combat timing only
- **Does NOT** track stats
- Clears timing flags at combat end

### Key Decisions

1. **Combat History Storage**: **Don't store combat summaries** - discard after lifetime update. If optional feature needed, use world flags with bounded array.

2. **Consolidation Approach**: **Option A** - Keep files separate with clear boundaries. `stats-combat.js` tracks events, `stats-player.js` consumes summary.

3. **Array Retention**: **Aggregates + Top N moments** - No full event arrays in combat tier. Only aggregates, totals, and highlights (top 5 hits, top 3 heals, etc.).

### Data Flow

```
Event Occurs (attack, damage, etc.)
  ↓
stats-combat.js tracks to currentStats (round data)
  ↓
Round End
  ↓
stats-combat.js generates round summary → Post to chat → Discard currentStats
  ↓
stats-combat.js accumulates to combatStats (combat data - aggregates only)
  ↓
Combat End
  ↓
stats-combat.js generates combat summary (aggregates + top N moments)
  ↓
stats-combat.js reports combat summary (chat/console)
  ↓
stats-combat.js fires hook: "blacksmith.combatSummaryReady"
  ↓
stats-player.js reads combat summary → Updates lifetime stats
  ↓
stats-combat.js discards combatStats (all combat data cleared)
  ↓
stats-player.js clears temporary session data
  ↓
Lifetime stats persist in actor flags forever
```

### Implementation Checklist

- [ ] Remove event arrays from `combatStats` (keep only aggregates)
- [ ] Implement top N moments tracking (maintain sorted list of top hits/heals)
- [ ] Add combat summary generation in `stats-combat.js`
- [ ] Remove combat event tracking from `stats-player.js`
- [ ] Add combat summary consumption in `stats-player.js`
- [ ] Add hook/event for combat summary handoff
- [ ] Clear all temporary flags at combat end
- [ ] Update cleanup in `timer-round.js` to clear timing flags
- [ ] Test data flow: round → combat → lifetime
- [ ] Verify no data loss and proper cleanup
- [ ] ✅ `combatStats.hits[]` replaced with `combatStats.totals.attacks.hits` (round summaries still use `currentStats.hits[]`)
- [ ] ✅ `combatStats.misses[]` replaced with `combatStats.totals.attacks.misses`

---

## Version History

- 2025-11-05: Initial architecture document created based on codebase analysis
- 2025-11-05: Expanded with detailed data retention policy and storage analysis

