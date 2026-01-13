# Stats Tracking - TODO & Tracking Status

This document tracks the current state of statistics tracking, what's actively being tracked, and what might be missing.

---

## Current Tracking Status

### ✅ Actively Tracked (Lifetime Stats)

#### Attacks (Tracked via Message Resolution Pipeline)
- ✅ `biggest` - Highest damage hit (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Resolved from `createChatMessage` hook via message resolution pipeline
- ✅ `weakest` - Lowest damage hit (same structure)
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Resolved from `createChatMessage` hook via message resolution pipeline
- ✅ `hitMissRatio` - Calculated from totalHits/totalMisses
  - **Location**: `scripts/stats-player.js` in `_processResolvedAttack`
  - **Source**: Determined from attack messages using `attackTotal >= target.ac` (not inferred from damage)
- ✅ `totalHits` - Total successful hits
  - **Location**: `scripts/stats-player.js` in `_processResolvedAttack`
  - **Source**: Counted from resolved attack messages (hitTargets array)
- ✅ `totalMisses` - Total misses
  - **Location**: `scripts/stats-player.js` in `_processResolvedAttack`
  - **Source**: Counted from resolved attack messages (missTargets array)
- ✅ `criticals` - Total critical hits (nat 20)
  - **Location**: `scripts/stats-player.js` in `_onAttackRoll` (real-time), reconciled in `_onCombatSummaryReady`
  - **Method**: Uses active d20 result (for advantage/disadvantage) from roll hooks
- ✅ `fumbles` - Total fumbles (nat 1)
  - **Location**: `scripts/stats-player.js` in `_onAttackRoll` (real-time), reconciled in `_onCombatSummaryReady`
  - **Method**: Uses active d20 result (for advantage/disadvantage) from roll hooks
- ✅ `totalDamage` - Total damage dealt (only "onHit" bucket)
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Resolved from damage messages, classified as "onHit" or "other"
- ✅ `damageByWeapon` - Object keyed by weapon name with total damage
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Extracted from resolved damage events
- ✅ `damageByType` - Object keyed by damage type with total damage
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Extracted from item damage parts
- ✅ `hitLog` - Array of last 20 hits (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)
  - **Location**: `scripts/stats-player.js` in `_processResolvedDamage`
  - **Source**: Resolved from attack/damage message correlation

#### Healing (Tracked via HP Delta and Chat Messages)
- ✅ `received` - Total healing received (via HP delta tracking)
  - **Location**: `scripts/stats-player.js:1257-1311` in `_recordAppliedHealing`
  - **Method**: HP delta detection in `_onActorUpdate` (preUpdateActor/updateActor hooks)
  - **Source of Truth**: HP delta tracking (Lane 1) - tracks actual applied healing
- ✅ `total` - Total healing given (via chat message detection)
  - **Location**: `scripts/stats-player.js:1302-1378` in `_recordRolledHealing`
  - **Method**: Chat message detection using `activity.type === "heal"` signal
  - **Note**: Informational/attribution only - HP delta is source of truth for applied healing
- ✅ `given` - Healing given (attributed to caster)
  - **Location**: `scripts/stats-player.js:1342` in `_recordRolledHealing`
- ✅ `byTarget` - Object keyed by target with healing amounts
  - **Location**: `scripts/stats-player.js:1346-1349` in `_recordRolledHealing`
- ✅ `mostHealed` - Highest healing given (single instance)
  - **Location**: `scripts/stats-player.js:1359` in `_recordRolledHealing`
- ✅ `leastHealed` - Lowest healing given (single instance)
  - **Location**: `scripts/stats-player.js:1360` in `_recordRolledHealing`
- ✅ `revives.received` - Times revived (HP went from 0 to >0)
  - **Location**: `scripts/stats-player.js:1289-1290` in `_recordAppliedHealing`

#### Turn Stats (Tracked in `_processTurnEnd`)
- ✅ `average` - Average turn duration
  - **Location**: `scripts/stats-player.js:547` in `_processTurnEnd`
- ✅ `total` - Total turn time
  - **Location**: `scripts/stats-player.js:545` in `_processTurnEnd`
- ✅ `count` - Number of turns
  - **Location**: `scripts/stats-player.js:546` in `_processTurnEnd`
- ✅ `fastest` - Fastest turn (duration, round, date)
  - **Location**: `scripts/stats-player.js:550-556` in `_processTurnEnd`
- ✅ `slowest` - Slowest turn (duration, round, date)
  - **Location**: `scripts/stats-player.js:557-563` in `_processTurnEnd`

#### MVP (Tracked in `_onCombatSummaryReady` and `_applyRoundMvpScore`)
- ✅ `totalScore` - Cumulative MVP score
  - **Location**: `scripts/stats-player.js:1121-1130` in `_onCombatSummaryReady`, `_updateLifetimeMvp` helper
- ✅ `highScore` - Highest single combat MVP score
  - **Location**: `scripts/stats-player.js:115` in `_updateLifetimeMvp` helper
- ✅ `combats` - Number of combats participated
  - **Location**: `scripts/stats-player.js:114` in `_updateLifetimeMvp` helper
- ✅ `averageScore` - Average MVP score
  - **Location**: `scripts/stats-player.js:116` in `_updateLifetimeMvp` helper
- ✅ `lastScore` - Last combat MVP score
  - **Location**: `scripts/stats-player.js:118` in `_updateLifetimeMvp` helper
- ✅ `lastRank` - Last combat MVP rank
  - **Location**: `scripts/stats-player.js:119` in `_updateLifetimeMvp` helper

#### Other Lifetime
- ✅ `unconscious.count` - Times knocked unconscious
  - **Location**: `scripts/stats-player.js` in `_recordUnconscious`
  - **Method**: HP delta detection in `_onActorUpdate` (preUpdateActor/updateActor hooks)
  - **Trigger**: HP drops from >0 to 0 or below
- ✅ `unconscious.log` - Array of unconscious events (last 100)
  - **Location**: `scripts/stats-player.js` in `_recordUnconscious`
  - **Attribution**: Queue-based damage context system with combat-aware matching
  - Contains: date, sceneName, oldHp, newHp, attackerName, weaponName, damageAmount
  - **Matching**: Scores candidates by combat round/turn, recency, and damage amount
- ❌ `movement` - Total movement distance
  - **NOT TRACKED** - Only defined in defaults, no tracking code
- ✅ `lastUpdated` - Last update timestamp
  - **Location**: `scripts/stats-player.js` in `updatePlayerStats`

### ✅ Session Stats Structure

- ✅ `combats` - Array of combat summaries
  - **Location**: `scripts/stats-player.js:1136-1150` in `_onCombatSummaryReady`
- ✅ `currentCombat` - Current combat ID
  - **Location**: `scripts/stats-player.js:498-517` in `_processTurnStart`
- ✅ `combatTracking` - Tracks hits/crits/fumbles added during combat (hitsAdded, critsAdded, fumblesAdded)
  - **Location**: Various places for tracking, reset in `_onCombatSummaryReady`

---

## Missing Tracking

### ✅ Healing Tracking
**Status**: **FULLY IMPLEMENTED** (Phase 1 - Lane 1 HP Delta + Chat Message Attribution)

- ✅ `lifetime.healing.total` - Total healing given (tracked from chat messages)
- ✅ `lifetime.healing.received` - Total healing received (tracked via HP delta)
- ✅ `lifetime.healing.given` - Healing given (attributed to caster)
- ✅ `lifetime.healing.byTarget` - Object keyed by target with healing amounts
- ✅ `lifetime.healing.mostHealed` - Highest healing given (single instance)
- ✅ `lifetime.healing.leastHealed` - Lowest healing given (single instance)
- ✅ `lifetime.revives.received` - Times revived (HP went from 0 to >0)

**Implementation Details**:
- **Lane 1 (HP Delta)**: Source of truth for applied healing - tracks actual HP changes via `preUpdateActor`/`updateActor` hooks
- **Chat Messages**: Informational/attribution only - detects healing using `activity.type === "heal"` signal (dnd5e 5.2.4)
- **Detection**: Uses only reliable `flags.dnd5e.activity.type === "heal"` signal (no item name heuristics)
- **Architecture**: Chat messages tell us intent, HP delta tells us truth (per developer review guidance)

### ❌ Movement Tracking
**Status**: Field exists in defaults but **NOT TRACKED**

- `lifetime.movement` - Total movement distance

**Note**: No tracking code exists for movement. Would need to hook into token movement events.

### ✅ Unconscious Tracking
**Status**: **FULLY IMPLEMENTED** (Queue-Based Attribution System)

- ✅ `lifetime.unconscious.count` - Times knocked unconscious
  - **Location**: `scripts/stats-player.js` in `_recordUnconscious`
  - **Method**: HP delta detection in `_onActorUpdate` (preUpdateActor/updateActor hooks)
  - **Trigger**: HP drops from >0 to 0 or below
  - **Source of Truth**: HP delta tracking (same pattern as healing)
- ✅ `lifetime.unconscious.log` - Array of unconscious events (last 100)
  - Each event contains:
    - `date` - ISO timestamp of when unconscious occurred
    - `sceneName` - Scene where it happened
    - `oldHp` - HP before going unconscious
    - `newHp` - HP after (should be <= 0)
    - `attackerName` - Name of attacker (from damage context queue)
    - `weaponName` - Weapon/spell name (from damage context queue)
    - `damageAmount` - Damage amount from damage context (or null if unavailable)

**Implementation Details**:
- **Detection**: Uses HP delta tracking in `_onActorUpdate` - detects when `preHp.hp > 0 && newHp <= 0`
- **Attribution System**: Queue-based damage context storage (last 10 entries per target)
  - Stores damage context for ALL targets from damage messages (before bucket filtering)
  - Includes combat round/turn information for better matching
  - TTL window: 15 seconds (increased from 5s to account for delays)
- **Context Selection**: Scores candidates by:
  - Same combat round + turn = +1000 points (highest priority)
  - Same combat round = +100 points
  - Recency bonus (newer = better, max 15000 points)
  - Damage amount bonus (larger = more likely cause)
- **Damage Event Hydration**: Extracts missing fields from chat messages:
  - Attacker from `message.speaker.actor`
  - Item from `message.flags.dnd5e.item.uuid` (and variants)
  - Targets from `message.flags.dnd5e.targets`
  - Fallback names when resolution fails
- **Logging**: Human-readable console logging using `postConsoleAndNotification` with "Player Stats | " prefix

---

## Shared Functions Analysis

### ✅ Shared Message Resolution Utilities
**Location**: `scripts/utility-message-resolution.js`

- `hydrateFirstRoll(message)` - Handles v13 roll hydration (string, object, or Roll instance)
- `getKeyParts(message)` - Extracts stable key parts (attackerActorId, itemUuid, activityUuid, sorted targetUuids)
- `makeKey(parts)` - Creates stable string key from key parts
- `resolveAttackMessage(message)` - Parses attack messages, computes hit/miss per target
- `resolveDamageMessage(message)` - Parses damage messages, extracts damage total and metadata
- **Used By**: Both `CombatStats` and `CPBPlayerStats` for consistent message resolution

### ❌ NOT Shared - Each system tracks independently

**Attack/Damage Tracking:**
- `CPBPlayerStats._processResolvedDamage` - Tracks damageByWeapon, damageByType, biggest, weakest, hitLog
- `CombatStats._processResolvedDamage` - Tracks combat-level damage/healing (doesn't update player lifetime)
- **Note**: These are separate - CombatStats tracks for combat summaries, CPBPlayerStats tracks for lifetime stats
- **Both use**: Shared message resolution utilities from `utility-message-resolution.js`

**Healing Tracking:**
- `CombatStats._processDamageOrHealing` - Tracks healing for combat stats only
- `CPBPlayerStats._recordAppliedHealing` - Tracks lifetime healing received (HP delta)
- `CPBPlayerStats._recordRolledHealing` - Tracks lifetime healing given (chat messages)
- **Note**: Separate systems with different purposes

**Turn Stats:**
- `CPBPlayerStats._processTurnEnd` - Tracks turn stats for player lifetime
- **Note**: CombatStats tracks turn times for combat stats, but these are separate systems

**MVP:**
- `CPBPlayerStats._updateLifetimeMvp` - Helper function for MVP calculations
- `CPBPlayerStats._applyRoundMvpScore` - Applies round MVP scores
- `CPBPlayerStats._onCombatSummaryReady` - Applies combat MVP scores
- **Note**: MVP tracking is all in CPBPlayerStats, uses shared helper `_updateLifetimeMvp`

---

## Data Verification Notes

### Hit Log Fields
The `hitLog` array should contain:
- `amount` - Damage dealt ✅
- `date` - ISO timestamp ✅
- `weaponName` - Name of weapon/item ✅
- `attackRoll` - Attack roll total (may be null for some entries) ⚠️
- `targetName` - Target name ✅
- `targetAC` - Target AC (may be null for some entries) ⚠️
- `sceneName` - Scene name ✅
- `isCritical` - Critical hit flag ✅ (currently always false - needs improvement)

**Note**: Some `hitLog` entries may have `null` for `attackRoll` or `targetAC` if:
- The attack message didn't contain target AC information (unknown targets)
- The data was collected before the new message resolution system was implemented
- The attack event couldn't be resolved for that particular hit

### Session Data - Legacy Fields
- ⚠️ `session.pendingAttacks` - **REMOVED from defaults**, but may exist in existing actor data as empty object `{}`
  - This field is no longer used (attack/damage correlation now handled via chat message resolution)
  - Should be ignored/cleaned up if present in existing data
  - Does not affect functionality

---

## Remaining Work

### High Priority
- [x] **Implement healing tracking** - ✅ COMPLETED - Added lifetime healing stats tracking (total, received, given, byTarget, mostHealed, leastHealed, revives)
  - ✅ Implemented HP delta tracking (Lane 1) for applied healing - source of truth
  - ✅ Implemented chat message detection for healing attribution using `activity.type === "heal"` signal
  - ✅ Simplified detection to only use reliable `activity.type === "heal"` (removed item name heuristics)
  - ✅ Added `_recordAppliedHealing` for target's received healing and revives
  - ✅ Added `_recordRolledHealing` for caster's given healing and totals
- [x] **Refactor hit/miss/damage tracking** - ✅ COMPLETED - Moved to message resolution pipeline
  - ✅ Created `utility-message-resolution.js` with shared resolution functions
  - ✅ Replaced unstable `originatingMessage` correlation with stable identifiers
  - ✅ Determines hit/miss from attack messages (`attackTotal >= target.ac`) instead of inferring from damage
  - ✅ Classifies damage as "onHit" or "other" based on attack outcome
  - ✅ Narrowed roll hooks to only crit/fumble detection
  - ✅ Added attack cache system with TTL and deduplication
- [x] **Implement unconscious tracking** - ✅ COMPLETED - Added unconscious event tracking with queue-based attribution
  - ✅ Implemented HP delta detection for unconscious events (HP drops from >0 to 0 or below)
  - ✅ Added queue-based damage context storage (last 10 entries per target)
  - ✅ Implemented combat-aware matching (scores by round/turn, recency, damage amount)
  - ✅ Added damage event hydration from chat messages for missing fields
  - ✅ Stores date, scene, HP change, attacker name, weapon name, and damage amount
- [x] **Fix crit/fumble detection** - ✅ COMPLETED - Now uses active d20 result for advantage/disadvantage
  - ✅ Handles multiple d20 terms correctly
  - ✅ Uses active result (marked `active: true`) instead of first result
  - ✅ Falls back to first result if no active result found
- [ ] Fix `isCritical` in hitLog - Currently always `false`, needs proper crit tracking
  - Should integrate crit detection from roll hooks into attack cache entries
  - Or track crits per attack event in the cache

### Medium Priority
- [ ] Document which fields may be null/undefined and why
- [ ] Add validation/fallbacks for missing fields in hitLog entries
- [ ] Consider adding "damage.rolled.other" tracking separately from "damage.rolled.onHit"

### Low Priority
- [ ] Implement movement tracking (requires token movement hooks)
- [ ] Consider adding more granular tracking (damage by target, hits by weapon, etc.)
- [ ] Performance optimization for large hitLog arrays
- [ ] Consider migration/cleanup script for existing data with `session.pendingAttacks`

---

## Architecture Notes

### Message Resolution System
- **Shared Utilities**: `scripts/utility-message-resolution.js` provides shared functions for both CombatStats and CPBPlayerStats
- **Stable Keying**: Uses `speaker.actor`, `flags.dnd5e.item.uuid`, `flags.dnd5e.activity.uuid`, and sorted target UUIDs (replaces unstable `originatingMessage`)
- **Attack Resolution**: Determines hit/miss from attack messages using `attackTotal >= target.ac` (not inferred from damage)
- **Damage Classification**: Classifies damage as "onHit" or "other" based on attack outcome (handles midi-qol "damage on miss")
- **Roll Hooks**: Narrowed to only crit/fumble detection and metadata (hit/miss/damage moved to `createChatMessage`)
- **Socket Handlers**: Still use old methods for non-GM client forwarding (backward compatibility)

### Data Flow
1. `createChatMessage` hook → `resolveAttackMessage` / `resolveDamageMessage` (shared utilities)
2. Resolved events → `_processResolvedAttack` / `_processResolvedDamage` (system-specific)
3. Real-time tracking updates lifetime stats immediately
4. Combat summary reconciliation at combat end (`blacksmith.combatSummaryReady`)
5. Session stats track temporary combat data (combatTracking for reconciliation)

### Damage Context System (Unconscious Attribution)
- **Storage**: Queue-based per target (`Map<actorId, DamageContext[]>`)
- **TTL**: 15 seconds (increased from 5s to account for delays)
- **Queue Size**: Last 10 entries per target (bounded)
- **Hydration**: Extracts missing fields from chat messages (attacker, item, targets)
- **Selection**: Scores candidates by combat round/turn, recency, and damage amount
- **Storage Timing**: Context stored immediately after damage message resolution, before bucket filtering

### Shared vs Separate Functions
- **SHARED**: Message resolution utilities (`utility-message-resolution.js`) used by both systems
- **NOT SHARED**: Each system (CombatStats vs CPBPlayerStats) tracks independently for their purposes
- CombatStats tracks for combat summaries (ephemeral)
- CPBPlayerStats tracks for lifetime stats (persistent)
- MVP uses shared helper `_updateLifetimeMvp` for calculations

---

## Last Updated
2026-01-13 - After unconscious tracking implementation (queue-based attribution) and hit/miss/damage refactoring (message resolution pipeline)
