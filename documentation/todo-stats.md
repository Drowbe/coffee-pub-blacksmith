# Stats Tracking - TODO & Tracking Status

This document tracks the current state of statistics tracking, what's actively being tracked, and what might be missing.

---

## Current Tracking Status

### ✅ Actively Tracked (Lifetime Stats)

#### Attacks
- ✅ `biggest` - Highest damage hit (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)
- ✅ `weakest` - Lowest damage hit (same structure)
- ✅ `hitMissRatio` - Calculated from totalHits/totalMisses
- ✅ `totalHits` - Total successful hits
- ✅ `totalMisses` - Total misses
- ✅ `criticals` - Total critical hits (nat 20)
- ✅ `fumbles` - Total fumbles (nat 1)
- ✅ `totalDamage` - Total damage dealt
- ✅ `damageByWeapon` - Object keyed by weapon name with total damage
- ✅ `damageByType` - Object keyed by damage type with total damage
- ✅ `hitLog` - Array of last 20 hits (amount, date, weaponName, attackRoll, targetName, targetAC, sceneName, isCritical)

#### Healing
- ✅ `total` - Total healing given
- ✅ `received` - Total healing received
- ✅ `byTarget` - Object keyed by target with healing amounts
- ✅ `mostHealed` - Highest healing given (single instance)
- ✅ `leastHealed` - Lowest healing given (single instance)

#### Turn Stats
- ✅ `average` - Average turn duration
- ✅ `total` - Total turn time
- ✅ `count` - Number of turns
- ✅ `fastest` - Fastest turn (duration, round, date)
- ✅ `slowest` - Slowest turn (duration, round, date)

#### Other Lifetime
- ✅ `unconscious` - Times knocked unconscious
- ✅ `movement` - Total movement distance (if tracked)
- ✅ `lastUpdated` - Last update timestamp
- ✅ `mvp` - MVP statistics (totalScore, highScore, combats, averageScore, lastScore, lastRank)

### ✅ Session Stats Structure

- ✅ `combats` - Array of combat summaries
- ✅ `currentCombat` - Current combat ID
- ✅ `combatTracking` - Tracks hits/crits/fumbles added during combat (hitsAdded, critsAdded, fumblesAdded)

### ⚠️ Legacy Data Issues

- ⚠️ `session.pendingAttacks` - **REMOVED** from defaults, but may still exist in existing actor data
  - This field is no longer used (attack/damage correlation now handled via chat message resolution)
  - Should be ignored/cleaned up if present in existing data

---

## Data Verification Notes

### Hit Log Fields
The `hitLog` array should contain:
- `amount` - Damage dealt ✅
- `date` - ISO timestamp ✅
- `weaponName` - Name of weapon/item ✅
- `attackRoll` - Attack roll total (may be missing for some entries) ⚠️
- `targetName` - Target name ✅
- `targetAC` - Target AC (may be null/missing) ⚠️
- `sceneName` - Scene name ✅
- `isCritical` - Critical hit flag ✅

**Note**: Some `hitLog` entries may be missing `attackRoll` or `targetAC` if the data was collected before the new message resolution system was implemented, or if the attack message didn't contain target AC information.

---

## Remaining Work

### High Priority
- [ ] Verify `hitLog` entries are consistently populated with all fields
- [ ] Consider migration/cleanup script for existing data with `session.pendingAttacks`
- [ ] Test that all fields are being tracked correctly with the new message resolution system

### Medium Priority
- [ ] Document which fields may be null/undefined and why
- [ ] Add validation/fallbacks for missing fields in hitLog entries

### Low Priority
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

---

## Last Updated
2026-01-11 - After message resolution system refactoring
