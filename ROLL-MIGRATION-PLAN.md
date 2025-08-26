# ROLL MIGRATION PLAN

## **Architecture (SIMPLE)**
- **GM chooses ONE system** in `diceRollToolSystem` setting
- **BOTH paths use the SAME selected system**
- **No more confusion about multiple systems**

## **The Two Paths (SAME SYSTEM)**
1. **Roll Dialog Path**: GM Request → Chat Card → Player Clicks → **SELECTED SYSTEM** Roll Dialog → **SELECTED SYSTEM** Roll Processing → Update Chat Card
2. **Cinema Path**: GM Request → Chat Card → Fast Forward to Cinema → **SELECTED SYSTEM** Roll Processing → Update Chat Card

## **Process Map (LOCKED SEQUENCE)**

### **GM Request Roll → Chat Card Creation**
1. **GM opens SkillCheckDialog** (skill-check-dialog.js)
2. **GM selects actors, roll type, options**
3. **GM clicks "Roll" button**
4. **System creates ChatMessage** with roll request data
5. **Chat card appears** in chat with roll buttons for each actor

### **Roll Dialog Path (Player Clicks in Chat)**
6. **Player clicks roll button** in chat card
7. **System calls `showRollDialog()`** with actor/roll data
8. **RollDialog opens** (roll-dialog.hbs template)
9. **Player selects roll options** (advantage/disadvantage/situational bonus)
10. **Player clicks roll button** (normal/advantage/disadvantage)
11. **System calls `_executeRoll()`** → `_performRoll()`
12. **SELECTED SYSTEM processes roll** (Blacksmith OR Foundry based on setting)
13. **System calls `handleSkillRollUpdate()`** with roll results
14. **Chat card updates** with roll results and visual feedback

### **Cinema Path (Fast Forward to Cinema Mode)**
6. **System detects cinematic mode** from chat card flags
7. **Cinematic overlay opens** automatically
8. **Player clicks roll button** in cinematic overlay
9. **System calls `executeRollAndUpdate()`** directly
10. **SELECTED SYSTEM processes roll** (Blacksmith OR Foundry based on setting)
11. **System calls `handleSkillRollUpdate()`** with roll results
12. **Chat card updates** with roll results and visual feedback
13. **Cinematic overlay updates** with roll results

### **Final Result (Both Paths)**
14. **Chat card shows roll results** for all actors
15. **Results include**: roll totals, success/failure, DC comparison, group results
16. **System plays appropriate sounds** (success, failure, critical, etc.)
17. **GM can see all results** and manage the scene

## **Current State**
- **Right now**: Rolling uses **FOUNDRY system** (not our system)
- **Need to package**: This Foundry code for when users choose "foundry" setting
- **Need to restore**: Our functional Blacksmith system from backups

## **The Goal**
- **Settings control**: `diceRollToolSystem` dropdown chooses system
- **Unified execution**: Both paths use exact same roll processing based on setting
- **No more confusion**: One system, two entry points

## **System Context**

### **BLACKSMITH SYSTEM** (Backed Up) - **STUDYING IN PROGRESS** 🔍
- **Location**: `@AI-SKILLCHECK-BACK.js` and `@AI-UTILSROLLS-BACK.js`
- **Status**: 100% functional, backed up before my changes broke it
- **Need**: DEEPLY understand this code to restore our Blacksmith system

#### **BLACKSMITH SYSTEM FINDINGS** (Updated as I learn)
- **Core Function**: `executeRoll()` - Main entry point that checks `diceRollToolSystem` setting
- **Roll Dialog**: `showRollDialog()` → `RollDialog` class → `_executeRoll()` → `_performRoll()`
- **Manual Roll Creation**: `_executeBuiltInRoll()` - Creates Foundry Roll objects manually for complete control
- **Formula Building**: Manually builds roll formulas (1d20 + abilityMod + profBonus + situationalBonus)
- **Advantage/Disadvantage**: Handles 2d20kh/2d20kl for advantage/disadvantage
- **Roll Types Supported**: skill, ability, save, tool, dice
- **Chat Suppression**: Uses manual Roll creation to suppress Foundry's default chat messages
- **Integration**: Calls `handleSkillRollUpdate()` for chat card updates

### **FOUNDRY SYSTEM** (Current Code) - **STUDYING NEXT** 🔍
- **Location**: Current `scripts/utils-rolls.js` and related files
- **Status**: Completely functional, but mixed with legacy/orphaned code
- **Need**: DEEPLY understand this code to package it cleanly for "foundry" choice

#### **FOUNDRY SYSTEM FINDINGS** (Updated as I learn)
- **Core Function**: `executeRollAndUpdate()` - Robust roll execution with D&D5e API integration
- **Roll Types Supported**: skill, ability, save, tool, dice (same as Blacksmith)
- **D&D5e API Integration**: Uses `game.dnd5e.actions.rollSkill`, `actor.rollAbilityTest`, `actor.rollSavingThrow`
- **Fallback System**: Multiple API versions supported (modern → legacy compatibility)
- **Permission Checks**: Validates GM/owner permissions before allowing rolls
- **Chat Suppression**: Uses `chatMessage: false, createMessage: false` to suppress Foundry's default chat
- **Manual Roll Fallbacks**: Falls back to manual Roll creation when D&D5e APIs fail
- **Socket Communication**: Emits `updateSkillRoll` events and calls `handleSkillRollUpdate()`
- **Error Handling**: Comprehensive error handling with user notifications
- **Integration**: Seamlessly integrates with existing chat card update system

## **System Analysis Summary** (What I've Learned)

### **Key Differences Between Systems**

| Aspect | **BLACKSMITH SYSTEM** | **FOUNDRY SYSTEM** |
|--------|----------------------|-------------------|
| **Roll Creation** | Manual Roll objects (complete control) | D&D5e API integration + manual fallbacks |
| **Formula Building** | Manually constructs formulas | Uses D&D5e system formulas |
| **Chat Suppression** | Manual Roll creation suppresses chat | API options suppress chat |
| **Advantage/Disadvantage** | 2d20kh/2d20kl in formulas | Handled by D&D5e APIs |
| **Fallback Strategy** | Always manual (predictable) | API → manual fallback (robust) |
| **Integration Point** | `_performRoll()` → `handleSkillRollUpdate()` | `executeRollAndUpdate()` → `handleSkillRollUpdate()` |

### **What Both Systems Share**
- **Same roll types**: skill, ability, save, tool, dice
- **Same final result**: Both call `handleSkillRollUpdate()` for chat card updates
- **Same socket communication**: Both emit `updateSkillRoll` events
- **Same permission model**: Both check GM/owner permissions
- **Same error handling**: Both have comprehensive error handling

### **Implementation Strategy**
- **Phase 1**: Extract `executeRollAndUpdate()` as clean Foundry system
- **Phase 2**: Restore `_executeBuiltInRoll()` + `RollDialog` as clean Blacksmith system  
- **Phase 3**: Make both paths use the selected system via `diceRollToolSystem` setting

## **Implementation Phases**

### **Phase 1: Package Foundry System** ✅
- **Status**: COMPLETE - Foundry system extracted and organized
- **Goal**: Extract current Foundry roll code into clean, separate system
- **Deliverable**: Foundry roll system that users can choose in settings
- **Prerequisite**: DEEPLY understand current Foundry roll code
- **Progress**: 
  - ✅ **Foundry system extracted** - `executeRollAndUpdate()` is now clean and separate
  - ✅ **Code organized** - Clear section headers for both systems
  - ✅ **Documentation added** - Clear comments explaining each system
  - ✅ **File structure complete** - All systems properly organized with headers

### **Phase 2: Restore Blacksmith System** 🔄
- **Status**: READY TO START  
- **Goal**: Restore our functional Blacksmith system from backups
- **Deliverable**: Working Blacksmith roll system that users can choose in settings
- **Prerequisite**: DEEPLY understand backed up Blacksmith code

### **Phase 3: Unify Both Paths** 🔄
- **Status**: READY TO START
- **Goal**: Make both Roll Dialog and Cinema paths use the selected system
- **Deliverable**: Both entry points use same roll processing based on setting

## **What I Need to Do (Later)**
1. **Package Foundry system** for "foundry" choice
2. **Restore our Blacksmith system** from backups for "blacksmith" choice  
3. **Make both paths use the selected system**

## **Key Principles**
- **NO MORE CONFUSION**: Both modes use the SAME roll system
- **Settings drive everything**: GM choice determines which system is used
- **Unified execution**: Same roll processing regardless of entry point
- **Simple architecture**: One system, two UI entry points

## **TODOs**
- [x] **DEEPLY UNDERSTAND**: Study backed up Blacksmith system code thoroughly
- [x] **DEEPLY UNDERSTAND**: Study current Foundry system code thoroughly  
- [ ] **Phase 1**: Extract Foundry roll code into clean system
- [ ] **Phase 2**: Restore Blacksmith system from backups  
- [ ] **Phase 3**: Unify both paths to use selected system
- [ ] **Testing**: Verify both systems work independently
- [ ] **Testing**: Verify both paths use selected system correctly
- [ ] **Documentation**: Update any user-facing documentation

**This plan is LOCKED. No more confusion about multiple systems or different execution paths.**
