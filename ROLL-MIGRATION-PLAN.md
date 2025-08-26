# ROLL MIGRATION PLAN

## **THE REALITY CHECK**
**Window Mode already works end-to-end.** We should optimize that flow, then make Cinema Mode use the exact same logic.

## **THE UNIFIED APPROACH**

### **PHASE 1: OPTIMIZE WINDOW MODE FLOW**
Since Window Mode already works end-to-end, we should:
1. **Extract the working roll logic** from the current Window Mode path
2. **Clean up the function chain** to be more direct
3. **Make it the single source of truth** for roll execution

### **PHASE 2: MAKE CINEMA USE THE SAME FLOW**
Cinema Mode should:
1. **Skip the chat card click** (bypass that step)
2. **Open the cinema overlay** instead of the roll window
3. **Use the exact same roll execution logic** from Window Mode
4. **Resolve the same way** to chat

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
- **Window Mode**: Working end-to-end (GM Request → Chat Card → Player Click → Roll Window → Configure → Execute → Resolve)
- **Cinema Mode**: Blocked because roll window also opens (needs to bypass click and use same execution path)
- **Goal**: Extract working Window Mode logic, make Cinema Mode use it with different UI presentation

## **NEW IMPLEMENTATION PLAN**

### **PHASE 1: CREATE THE NEW FUNCTIONS IN utils-rolls.js**
1. **`requestRoll()`** - Creates chat card and handles initial flow routing
2. **`orchestrateRoll()`** - Packages data, selects system, chooses mode
3. **`processRoll()`** - Executes the actual dice roll
4. **`deliverRollResults()`** - Updates chat card and cinema overlay

### **PHASE 2: REFACTOR window-skillcheck.js**
- Remove all roll execution logic
- Make it call `requestRoll()` instead of creating chat cards directly
- Keep only the UI setup and roll request functionality

### **PHASE 3: REMOVE OLD CODE**
- Delete my confusing 3-phase system (`rollRoute`, `rollExecute`, `rollUpdate`)
- Delete the complex `RollDialog` class and `showRollDialog()`
- Delete `executeRoll()`, `executeRollAndUpdate()`, and all the `_execute*` functions
- Keep only the new 4-function system

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

1. **Create the 4 core functions** in utils-rolls.js
2. **Test each function independently** to ensure they work
3. **Refactor window-skillcheck.js** to use the new system
4. **Remove all old code** once new system is working
5. **Verify both Window and Cinema modes** use identical execution paths
