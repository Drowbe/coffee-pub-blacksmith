# Stats Tracking - TODO & Tracking Status

This document tracks the current state of statistics tracking, what's actively being tracked, and what might be missing.

---

## Current Tracking Status

### ✅ Actively Tracked (Lifetime Stats)

#### Attacks (Tracked in `_processResolvedDamage`)
- ✅ `biggest` - Highest damage hit (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)
  - **Location**: `scripts/stats-player.js:894-899` in `_processResolvedDamage`
- ✅ `weakest` - Lowest damage hit (same structure)
  - **Location**: `scripts/stats-player.js:901-905` in `_processResolvedDamage`
- ✅ `hitMissRatio` - Calculated from totalHits/totalMisses
  - **Location**: `scripts/stats-player.js:746-750` in `_processResolvedAttack`
- ✅ `totalHits` - Total successful hits
  - **Location**: `scripts/stats-player.js:740` in `_processResolvedAttack`
- ✅ `totalMisses` - Total misses
  - **Location**: `scripts/stats-player.js:741` in `_processResolvedAttack`
- ✅ `criticals` - Total critical hits (nat 20)
  - **Location**: `scripts/stats-player.js:990-1001` in `_onAttackRoll` (real-time), reconciled in `_onCombatSummaryReady`
- ✅ `fumbles` - Total fumbles (nat 1)
  - **Location**: `scripts/stats-player.js:990-1001` in `_onAttackRoll` (real-time), reconciled in `_onCombatSummaryReady`
- ✅ `totalDamage` - Total damage dealt
  - **Location**: `scripts/stats-player.js:829` in `_processResolvedDamage`
- ✅ `damageByWeapon` - Object keyed by weapon name with total damage
  - **Location**: `scripts/stats-player.js:832-836` in `_processResolvedDamage`
- ✅ `damageByType` - Object keyed by damage type with total damage
  - **Location**: `scripts/stats-player.js:838-851` in `_processResolvedDamage`
- ✅ `hitLog` - Array of last 20 hits (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)
  - **Location**: `scripts/stats-player.js:907-912` in `_processResolvedDamage`

#### Healing
- ❌ **NOT TRACKED** - Fields exist in defaults but no tracking code implemented
  - `total` - Total healing given
  - `received` - Total healing received
  - `byTarget` - Object keyed by target with healing amounts
  - `mostHealed` - Highest healing given (single instance)
  - `leastHealed` - Lowest healing given (single instance)
  - **Note**: `_onActorUpdate` is just a stub (line 1063: "We'll implement this to track HP changes and unconsciousness")
  - **CombatStats** tracks healing in `_processDamageOrHealing` but this doesn't update player lifetime stats

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
- ❌ `unconscious` - Times knocked unconscious
  - **NOT TRACKED** - Only defined in defaults, `_onActorUpdate` is just a stub
- ❌ `movement` - Total movement distance
  - **NOT TRACKED** - Only defined in defaults, no tracking code
- ✅ `lastUpdated` - Last update timestamp
  - **Location**: `scripts/stats-player.js:280` in `updatePlayerStats`

### ✅ Session Stats Structure

- ✅ `combats` - Array of combat summaries
  - **Location**: `scripts/stats-player.js:1136-1150` in `_onCombatSummaryReady`
- ✅ `currentCombat` - Current combat ID
  - **Location**: `scripts/stats-player.js:498-517` in `_processTurnStart`
- ✅ `combatTracking` - Tracks hits/crits/fumbles added during combat (hitsAdded, critsAdded, fumblesAdded)
  - **Location**: Various places for tracking, reset in `_onCombatSummaryReady`

---

## Missing Tracking

### ❌ Healing Tracking
**Status**: Fields exist in defaults but **NOT TRACKED**

- `lifetime.healing.total` - Total healing given
- `lifetime.healing.received` - Total healing received
- `lifetime.healing.byTarget` - Object keyed by target with healing amounts
- `lifetime.healing.mostHealed` - Highest healing given (single instance)
- `lifetime.healing.leastHealed` - Lowest healing given (single instance)

**Note**: `CombatStats._processDamageOrHealing` tracks healing for combat stats, but this doesn't update player lifetime stats. We would need to detect healing in the damage resolution pipeline and update lifetime stats.

### ❌ Movement Tracking
**Status**: Field exists in defaults but **NOT TRACKED**

- `lifetime.movement` - Total movement distance

**Note**: No tracking code exists for movement. Would need to hook into token movement events.

### ❌ Unconscious Tracking
**Status**: Field exists in defaults but **NOT TRACKED**

- `lifetime.unconscious` - Times knocked unconscious

**Note**: `_onActorUpdate` is just a stub (line 1063). Would need to detect when actor HP drops to 0 or below.

---

## Shared Functions Analysis

### ❌ NOT Shared - Each system tracks independently

**Attack/Damage Tracking:**
- `CPBPlayerStats._processResolvedDamage` - Tracks damageByWeapon, damageByType, biggest, weakest, hitLog
- `CombatStats._processDamageOrHealing` - Tracks combat-level damage/healing (doesn't update player lifetime)
- **Note**: These are separate - CombatStats tracks for combat summaries, CPBPlayerStats tracks for lifetime stats

**Healing Tracking:**
- `CombatStats._processDamageOrHealing` - Tracks healing for combat stats only
- **Missing**: Player lifetime healing tracking

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
- [ ] **Implement healing tracking** - Add lifetime healing stats tracking (total, received, byTarget, mostHealed, leastHealed)
  - Need to detect healing in damage resolution pipeline
  - Could leverage `CombatStats._processDamageOrHealing` detection logic
  - Need to update `_processResolvedDamage` or add healing-specific handler
- [ ] Fix `isCritical` in hitLog - Currently always `false` (line 880), needs proper crit tracking
  - Should use cache entry or track crits per attack event

### Medium Priority
- [ ] Consider migration/cleanup script for existing data with `session.pendingAttacks`
- [ ] Document which fields may be null/undefined and why
- [ ] Add validation/fallbacks for missing fields in hitLog entries

### Low Priority
- [ ] Implement movement tracking (requires token movement hooks)
- [ ] Implement unconscious tracking (requires HP change detection in `_onActorUpdate`)
- [ ] Consider adding more granular tracking (damage by target, hits by weapon, etc.)
- [ ] Performance optimization for large hitLog arrays

---

## Architecture Notes

### Message Resolution System
- Attack/damage correlation now uses `createChatMessage` hook with stable keying
- Roll hooks (`dnd5e.rollAttack`, `dnd5e.rollDamage`) are narrowed to only crit/fumble detection
- Socket handlers (`_onSocketTrackAttack`, `_onSocketTrackDamage`) still use old methods for non-GM client forwarding

### Data Flow
1. `createChatMessage` hook → `_processResolvedAttack` / `_processResolvedDamage`
2. Real-time tracking updates lifetime stats immediately
3. Combat summary reconciliation at combat end (`blacksmith.combatSummaryReady`)
4. Session stats track temporary combat data (combatTracking for reconciliation)

### Shared vs Separate Functions
- **NOT SHARED**: Each system (CombatStats vs CPBPlayerStats) tracks independently
- CombatStats tracks for combat summaries (ephemeral)
- CPBPlayerStats tracks for lifetime stats (persistent)
- MVP uses shared helper `_updateLifetimeMvp` for calculations

---

## Last Updated
2026-01-11 - After message resolution system refactoring and comprehensive tracking audit
