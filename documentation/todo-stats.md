# Stats System Normalization Plan

This document outlines the plan to normalize combat/round stats with player stats architecture, ensuring both systems use shared utilities and support both core dnd5e and midi-qol.

---

## Current State

### Player Stats (`stats-player.js`) - ✅ Working
- **Multi-lane architecture**: Core chat parsing + MIDI workflow hooks + fallback hooks
- **Early message filtering**: Guards to skip non-system messages
- **Race condition protection**: Per-actor update queue
- **Robust crit/fumble detection**: Multi-source (workflow flags, roll flags, d20 inspection)
- **Reliable healing detection**: Uses `activity.type === "heal"` signal
- **MIDI healing support**: Processes via `preTargetDamageApplication` hook

### Combat Stats (`stats-combat.js`) - ⚠️ Partially Broken
- **Single-lane architecture**: Only `createChatMessage` hook (core lane)
- **No MIDI workflow hooks**: Missing `hitsChecked`, `preTargetDamageApplication`, `RollComplete`
- **No early message filtering**: Processes all messages (including module noise)
- **No race condition protection**: Concurrent writes can overwrite stats
- **Basic crit/fumble detection**: Uses `_lastRollWasCritical` flag (not multi-source)
- **Outdated healing detection**: Uses name heuristics instead of `activity.type === "heal"`
- **Core detection too strict**: `resolveAttackMessage()` requires `roll.type === "attack"`, rejects modern core messages

---

## Problem Statement

1. **Core attacks not detected**: `resolveAttackMessage()` is too strict - requires `dnd.roll.type === "attack"`, but modern core messages have `rollType: "none"` even with valid attack data
2. **No MIDI support in combat stats**: Combat stats relies solely on chat parsing, missing MIDI workflow hooks
3. **Code duplication risk**: Without shared utilities, both systems will duplicate MIDI parsing, crit/fumble detection, healing detection, dedupe logic
4. **Race conditions**: Multi-target healing (e.g., Mass Cure Wounds) can overwrite totals instead of accumulating

---

## Solution: Normalize First, Then Implement

**Key Principle**: Create shared utilities BEFORE adding MIDI lanes to combat stats, preventing duplication.

---

## Implementation Phases

### Phase 1: Fix Core Detection (IMMEDIATE)

**Goal**: Make `resolveAttackMessage()` accept modern core message structures without requiring targets.

**File**: `scripts/utility-message-resolution.js` (lines 161-174)

**Changes**:
- Replace current classifier with tiered detection:
  - **Tier 1**: Explicit roll type (`roll.type === "attack"`) - backward compat
  - **Tier 2**: Activity type indicates attack (`activity.type` in `["mwak", "rwak", "msak", "rsak", "attack"]`)
  - **Tier 3**: Heuristic (`hasD20 && hasItem && !isExcluded`) - **DO NOT require targets**
- Add explicit exclusions: `["check", "save", "damage", "heal"]` for roll types and activity types
- Early exit: If `activity.type === "heal"`, return null immediately
- Tighten MIDI detection: `workflowId` alone isn't enough, must also pass exclusion checks
- Allow unknown targets: Function can return attack events with empty targets (MIDI hooks provide authoritative data)

**Expected Outcome**: Core-only attacks should now be detected even when `rollType: "none"` and `targets: []`.

**Test**: Disable MIDI, perform core dnd5e attack, verify round/combat stats update.

---

### Phase 2: Create Shared MIDI Utilities (BEFORE Adding MIDI Lanes)

**Goal**: Extract shared MIDI workflow parsing so both systems use the same logic.

**New File**: `scripts/utility-midi-resolution.js`

**Functions to Create**:

1. **`getWorkflowKey(workflow, message)`**
   - Returns consistent key: `midi:${workflowId}` or fallback to message-based key
   - Handles workflowId extraction from multiple possible locations
   - Single source of truth for MIDI keying

2. **`getCritFumbleFromWorkflow({ workflow, attackRoll })`**
   - Multi-source crit/fumble detection (workflow flags, roll flags, d20 inspection)
   - Handles advantage/disadvantage correctly (active/kept results)
   - Returns: `{ isCritical, isFumble, sources: {...} }`

3. **`isHealingFromWorkflow({ workflow, dndFlags })`**
   - Core: `dndFlags?.activity?.type === "heal"`
   - MIDI: `workflow.isHealing` or damage type inspection
   - Single source of truth for healing detection

4. **`buildAttackEventFromWorkflow(workflow)`**
   - Converts MIDI workflow → normalized `AttackResolvedEvent`
   - Same shape as `resolveAttackMessage()` output
   - Extracts: attacker, item, targets, hit/miss outcomes, key
   - **Handles workflow argument shape variations across MIDI versions**

5. **`buildDamageEventFromWorkflow(workflow, targetUuid, amount, bucket)`**
   - Converts MIDI workflow + target → normalized `DamageResolvedEvent`
   - Same shape as `resolveDamageMessage()` output
   - Handles per-target damage attribution
   - **Extracts workflow arguments correctly (handles version variations)**

6. **`createDedupeTracker(ttlMs = 20000)`**
   - Returns: `{ isDuplicate(key), markProcessed(key) }`
   - TTL-based deduplication helper
   - Both systems use same dedupe logic

**Critical**: Build workflow extraction logic in ONE place (handles `preTargetDamageApplication` argument shape variations across MIDI versions/settings).

---

### Phase 3: Add MIDI Lanes to Combat Stats (Using Shared Utilities)

**Goal**: Add MIDI support to combat stats using shared utilities (before refactoring player stats).

**File**: `scripts/stats-combat.js`

**Changes**:

1. **Import shared utilities**:
   ```javascript
   import { 
       getWorkflowKey, 
       getCritFumbleFromWorkflow, 
       isHealingFromWorkflow,
       buildAttackEventFromWorkflow,
       buildDamageEventFromWorkflow,
       createDedupeTracker
   } from './utility-midi-resolution.js';
   ```

2. **Add early message filtering** (in `createChatMessage` callback):
   ```javascript
   const hasDnd5e = !!message.flags?.dnd5e;
   const hasMidi = !!message.flags?.["midi-qol"];
   const hasRolls = (message.rolls?.length ?? 0) > 0;
   if (!hasDnd5e && !hasMidi && !hasRolls) return;
   
   // Early exit for MIDI: let MIDI hooks handle it
   if (game.modules.get("midi-qol")?.active && hasMidi) {
       return; // MIDI hooks will process this
   }
   ```

3. **Register MIDI workflow hooks** (in `_registerHooks()`):
   - `midi-qol.hitsChecked` → `_onMidiHitsChecked()`
   - `midi-qol.preTargetDamageApplication` → `_onMidiPreTargetDamageApplication()`
   - `midi-qol.RollComplete` → `_onMidiRollComplete()`

4. **Initialize dedupe tracker**:
   ```javascript
   static _dedupeTracker = createDedupeTracker(20000);
   ```

5. **Implement MIDI handlers** (using shared utilities):
   - `_onMidiHitsChecked(workflow)` - Use `buildAttackEventFromWorkflow()`, cache, call `_processResolvedAttack()`
   - `_onMidiPreTargetDamageApplication(arg1, arg2)` - Use shared utilities for crit/fumble, healing, dedupe, build events
   - `_onMidiRollComplete(workflow)` - Use `getCritFumbleFromWorkflow()`, stamp onto cached attack event

6. **Add `_pendingMidiCrit` Map** (use shared `getCritFumbleFromWorkflow()`)

**Result**: Combat stats now has MIDI support using shared utilities, avoiding duplication.

---

### Phase 4: Refactor Player Stats to Use Shared Utilities

**Goal**: Replace duplicated MIDI logic in `stats-player.js` with shared utilities (after combat stats is working).

**File**: `scripts/stats-player.js`

**Changes**:

1. **Import shared utilities** (same as combat stats)

2. **Replace `_onMidiHitsChecked()`**:
   - Use `buildAttackEventFromWorkflow(workflow)` instead of manual parsing
   - Use `getWorkflowKey()` for consistent keying

3. **Replace `_onMidiPreTargetDamageApplication()`**:
   - Use `getCritFumbleFromWorkflow()` instead of inline detection
   - Use `isHealingFromWorkflow()` for healing detection
   - Use `buildDamageEventFromWorkflow()` for damage events
   - Use dedupe tracker for per-target deduplication

4. **Replace `_onMidiRollComplete()`**:
   - Use `getCritFumbleFromWorkflow()` instead of inline detection
   - Remove duplicate crit/fumble logic

5. **Remove `_getMidiWorkflowId()`** - use `getWorkflowKey()` instead

**Result**: Player stats becomes a consumer of shared utilities, completing normalization.

---

### Phase 5: Add Race Condition Protection

**Goal**: Prevent concurrent write issues (especially for multi-target healing).

**File**: `scripts/stats-combat.js`

**Changes**:

1. **Add actor update queue** (same implementation as player stats):
   ```javascript
   static _actorUpdateQueue = new Map();
   static async _queueActorUpdate(actorId, fn) { /* same as player stats */ }
   ```

2. **Wrap stat writes with queue**:
   - `_processResolvedAttack()` - queue attacker updates
   - `_processResolvedDamage()` - queue attacker updates  
   - `_processDamageOrHealing()` - queue attacker/healer updates

**Result**: Multi-target healing (Mass Cure Wounds) now accumulates correctly: `0 → 30 → 60 → 90` instead of overwriting.

---

### Phase 6: Update Healing Detection (Cleanup)

**Goal**: Use reliable `activity.type === "heal"` signal everywhere.

**File**: `scripts/stats-combat.js`

**Changes**:

1. **In `_processResolvedDamage()`** (line 1533-1542):
   - Remove name heuristics (`itemNameLower.includes("heal")`)
   - Remove `actionType` checks
   - Use shared `isHealingFromWorkflow()` or check `activity.type === "heal"` directly

2. **All healing detection** now goes through shared utilities.

**Result**: Consistent healing detection across both systems.

---

## File Structure After Normalization

```
scripts/
├── utility-message-resolution.js  (message-based detection)
│   ├── resolveAttackMessage()      [IMPROVED: tiered detection, no target requirement]
│   ├── resolveDamageMessage()
│   ├── resolveHealingMessage()
│   └── getKeyParts(), makeKey(), hydrateFirstRoll()
│
├── utility-midi-resolution.js     (workflow-based detection) [NEW]
│   ├── getWorkflowKey()
│   ├── getCritFumbleFromWorkflow()
│   ├── isHealingFromWorkflow()
│   ├── buildAttackEventFromWorkflow()
│   ├── buildDamageEventFromWorkflow()
│   └── createDedupeTracker()
│
├── stats-player.js                 (lifetime/session storage)
│   └── Uses utilities, writes to lifetime/session stats
│
└── stats-combat.js                 (round/combat storage)
    └── Uses utilities, writes to round/combat stats
```

---

## Key Design Decisions

### 1. No Target Requirement in Core Heuristic
- **Why**: Core messages often don't embed targets in message flags
- **Solution**: Heuristic is `hasD20 && hasItem && !isExcluded` (targets optional)
- **Result**: Core attacks detected even when `targets: []`

### 2. Allow Unknown Targets in Attack Events
- **Why**: Message parsing is "best-effort", workflow hooks are authoritative
- **Solution**: `resolveAttackMessage()` can return attack events with empty/unknown targets
- **Result**: MIDI hooks provide authoritative hit/miss data later

### 3. Early Exit for Healing Activities
- **Why**: Prevents misclassifying healing as attacks
- **Solution**: `if (activityType === "heal") return null;` at top of classifier
- **Result**: Cleaner separation between attack and healing detection

### 4. Tightened MIDI Detection
- **Why**: `workflowId` alone isn't enough (heals/features also have workflows)
- **Solution**: MIDI must pass exclusion checks AND have attack-like signals
- **Result**: Prevents combat/round trackers from processing non-attack workflows

### 5. Normalize Before Duplicating
- **Why**: Prevents "copy-paste now, dedupe later" (which never happens)
- **Solution**: Create shared utilities FIRST, then both systems use them
- **Result**: Single source of truth for MIDI parsing, crit/fumble, healing detection

### 6. Combat Stats First, Player Stats Second
- **Why**: Lower regression risk (player stats is working, combat stats is broken)
- **Solution**: Add MIDI lanes to combat stats first, then refactor player stats
- **Result**: Validate approach on broken system before touching working system

---

## Testing Strategy

### Phase 1 Testing (Core Detection Fix)
1. Disable MIDI-QOL
2. Perform core dnd5e attack
3. Verify:
   - `resolveAttackMessage()` returns non-null
   - Attack is cached in `CombatStats._attackCache`
   - Round stats show hits/misses
   - Combat summary shows correct aggregates

### Phase 3 Testing (MIDI Lanes in Combat Stats)
1. Enable MIDI-QOL
2. Perform attack with MIDI
3. Verify:
   - Chat message lane is skipped (early exit)
   - MIDI hooks process the attack
   - Round/combat stats update correctly

### Phase 5 Testing (Race Condition Protection)
1. Cast Mass Cure Wounds (or similar multi-target healing)
2. Verify:
   - No race conditions (totals accumulate: `30 → 60 → 90`)
   - No duplicate processing (dedupe working)
   - Round/combat stats show correct healing totals

### Phase 4 Testing (Player Stats Refactor)
1. Verify all existing player stats functionality still works
2. Verify MIDI lanes still work after refactor
3. Verify no regression in lifetime stats tracking

---

## Risk Assessment

- **Low Risk**: Core detection fix (only loosens criteria, doesn't break existing)
- **Medium Risk**: MIDI lanes (must match player stats patterns exactly)
- **Low Risk**: Actor update queue (proven pattern from player stats)
- **Low Risk**: Healing detection update (already partially using `activity.type`)
- **Medium Risk**: Player stats refactor (working code, but shared utilities reduce risk)

---

## Success Criteria

1. ✅ Core-only attacks detected and tracked in combat/round stats
2. ✅ MIDI attacks/damage/healing tracked in combat/round stats
3. ✅ No code duplication between player stats and combat stats
4. ✅ Multi-target healing accumulates correctly (no overwrites)
5. ✅ Both systems use same detection logic (shared utilities)
6. ✅ No regression in player stats functionality

---

## Implementation Order (Final)

1. **Phase 1**: Fix core detection (test immediately)
2. **Phase 2**: Create shared MIDI utilities (before adding MIDI lanes)
3. **Phase 3**: Add MIDI lanes to combat stats (using shared utilities)
4. **Phase 4**: Refactor player stats to use utilities (after combat stats works)
5. **Phase 5**: Add race condition protection
6. **Phase 6**: Cleanup healing detection

This sequence ensures normalization happens BEFORE duplication, reduces regression risk, and ensures both systems use the same detection logic.

---

## Last Updated
2026-01-13 - After player stats normalization and combat stats assessment
