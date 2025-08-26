# ROLL MIGRATION PLAN

## **CURRENT STATUS - SOCKET ISSUES BLOCKING ROLL SYSTEM**

**We've built the new 4-function unified roll system, but socket communication issues are preventing it from working properly.**

### **WHAT WE'VE ACCOMPLISHED:**
- ✅ **New 4-function architecture** implemented in `manager-rolls.js`
- ✅ **Logic migration** from old system to new functions
- ✅ **Data flow fixes** for `messageId` and `tokenId` context
- ✅ **Entry point updates** with chat card creation logic
- ✅ **Template renaming** from `window-element-*` to `partial-*`

### **WHAT'S BLOCKING US:**
- ❌ **Socket communication broken** - preventing roll results from syncing
- ❌ **Chat card duplication** - creating new cards instead of updating original
- ❌ **Multiple conflicting handlers** for `updateSkillRoll` events
- ❌ **Broken duplicate class** (`ThirdPartyManager`) causing socket errors

## **THE UNIFIED APPROACH**

### **PHASE 1: FIX SOCKET ISSUES (CRITICAL BLOCKER)**
Before we can get rolls working, we must fix the socket communication:
1. **Clean up duplicate socket handlers** in `blacksmith.js`
2. **Delete broken `ThirdPartyManager` class** (lines 1436-1540)
3. **Fix SocketLib initialization** problems
4. **Ensure `updateSkillRoll` events** work correctly

### **PHASE 2: VERIFY ROLL SYSTEM WORKS**
Once sockets are fixed, test the new 4-function system:
1. **Test chat card creation** and updating
2. **Verify roll execution** works end-to-end
3. **Test both Window and Cinema modes** use same logic
4. **Ensure results sync** across clients properly

### **PHASE 3: OPTIMIZE AND CLEAN UP**
After confirming everything works:
1. **Remove legacy code** (`utils-rolls-OLD.js`)
2. **Clean up any remaining** old roll functions
3. **Optimize the flow** based on real-world testing

## **THE CORRECT ARCHITECTURE**

```
ROLL REQUEST (from GM)
    ↓
ROUTE TO SYSTEM (Blacksmith vs Foundry)
    ↓
PRESENTATION LAYER:
    ├── WINDOW: showRollDialog() → RollDialog class
    └── CINEMA: showCinemaOverlay() → Cinema class
    ↓
UNIFIED ROLL EXECUTION (same logic for both)
    ↓
UNIFIED ROLL RESOLUTION (same logic for both)
```

## **KEY INSIGHT**
Cinema Mode is literally just "skip the chat card click and auto-open the cinema overlay." Everything after that should be identical to Window Mode.

## **WHAT THIS MEANS**
Instead of having separate execution paths for Window vs Cinema, we should have:

- **One unified roll execution system** that both UI methods call
- **Two different UI presentation methods** that both feed into the same roll logic
- **One shared resolution system** that both use

## **THE RESULT**
Cinema Mode becomes "Window Mode with a different UI presentation" rather than "a completely different roll system."

## **CURRENT STATUS**
- **New 4-Function System**: Built and ready in `manager-rolls.js`
- **Socket Issues**: Blocking all roll functionality from working properly
- **Chat Card Duplication**: System creating new cards instead of updating original
- **Goal**: Fix socket issues first, then verify roll system works end-to-end

## **NEW IMPLEMENTATION PLAN**

### **PHASE 1: FIX SOCKET ISSUES (IMMEDIATE PRIORITY)**
1. **Clean up duplicate socket handlers** in `blacksmith.js` (lines 454, 1461, 539)
2. **Delete broken `ThirdPartyManager` class** (lines 1436-1540)
3. **Fix SocketLib initialization** in `manager-sockets.js`
4. **Test socket communication** for `updateSkillRoll` events

### **PHASE 2: VERIFY ROLL SYSTEM FUNCTIONALITY**
1. **Test the new 4-function system** end-to-end
2. **Verify chat card creation** and updating works
3. **Test both Window and Cinema modes** use identical execution paths
4. **Ensure roll results sync** across all clients properly

### **PHASE 3: CLEAN UP LEGACY CODE**
1. **Remove `utils-rolls-OLD.js`** once new system is confirmed working
2. **Clean up any remaining** old roll functions
3. **Optimize the flow** based on real-world testing results

## **FUNCTION SPECIFICATIONS (EXACT NAMES)**

**`requestRoll(rollDetails)`**
- **Input**: Roll details from SkillCheckDialog
- **Purpose**: Create chat card, route to appropriate flow
- **Output**: Chat card created, flow initiated

**`orchestrateRoll(actor, type, value, options, messageId, tokenId)`**
- **Input**: Actor data, roll type, roll value, options, context
- **Purpose**: Package data, select system (Blacksmith), choose mode (Window/Cinema)
- **Output**: Prepared roll data and mode selection

**`processRoll(rollData, rollOptions)`**
- **Input**: Prepared roll data and user roll options
- **Purpose**: Execute dice roll, calculate results
- **Output**: Roll results object

**`deliverRollResults(rollResults, context)`**
- **Input**: Roll results and context (messageId, tokenId)
- **Purpose**: Update chat card, update cinema overlay, handle sockets
- **Output**: Success status

## **WHAT WE NEED TO ADD**

**Socket Communication Functions:**
- `emitRollUpdate()` - Emit socket events for GM updates
- `handleRollUpdate()` - Handle incoming socket events

**Mode-Specific UI Functions:**
- `showRollWindow(rollData)` - Display the roll configuration window
- `showCinemaOverlay(rollData)` - Display the cinematic overlay

**Data Preparation Functions:**
- `prepareRollData(actor, type, value)` - Build roll data for templates
- `buildRollFormula(type, value, options)` - Construct roll formulas

## **THE RESULT**

- **utils-rolls.js** = Single source of truth for ALL roll functionality
- **window-skillcheck.js** = Pure UI setup and roll request initiation
- **Clean, logical flow** with no duplicate paths or confusing names
- **Both Window and Cinema modes** use the exact same execution logic

## **IMPLEMENTATION ORDER**

1. **Fix socket issues** in `blacksmith.js` and `manager-sockets.js` (CRITICAL)
2. **Test socket communication** for `updateSkillRoll` events
3. **Verify the new 4-function roll system** works end-to-end
4. **Test both Window and Cinema modes** use identical execution paths
5. **Remove legacy code** once everything is confirmed working
6. **Optimize and clean up** based on real-world testing results

## **CRITICAL BLOCKER: SOCKET ISSUES**

**Why sockets are essential for the roll system:**
- Roll results must sync across all clients
- Chat card updates must work for all players
- Cinema mode display must work for other clients
- Roll context must be maintained for future interactions

**Without working sockets, the roll system cannot function properly.**

### **SPECIFIC SOCKET ISSUES IDENTIFIED:**

#### **1. Multiple Conflicting Socket Handlers**
Found **3 different socket registrations** for `updateSkillRoll` in `blacksmith.js`:
- **Line 454**: Main socket handler (working)
- **Line 1461**: Duplicate handler in broken `ThirdPartyManager` class (broken)
- **Line 539**: Native Foundry socket handler (conflicting)

#### **2. Broken Duplicate Class**
- **`ThirdPartyManager` class** (lines 1436-1540) attempting to register handlers on uninitialized `this.socket`
- **Error**: `Third Party Manager | Error: Socket not ready`
- **Error**: `TypeError: Cannot read properties of null (reading 'executeForOthers')`
- **Impact**: Vote tools, combat timers, and other socket-dependent features broken

#### **3. SocketLib Initialization Problems**
- **`SocketManager.getSocket()`** returning `null` because `isSocketReady` was `false`
- **Root Cause**: `Hooks.once('socketlib.ready', ...)` callback in `SocketManager.initialize()` not firing
- **Impact**: Socket communication completely broken for non-core features

### **IMMEDIATE ACTION REQUIRED:**
1. **Delete the broken `ThirdPartyManager` class** (lines 1436-1540)
2. **Clean up duplicate socket handlers** for `updateSkillRoll`
3. **Fix SocketLib initialization** in `manager-sockets.js`
4. **Test socket communication** before proceeding with roll system
