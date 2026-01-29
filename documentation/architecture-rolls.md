# Blacksmith Rolls Architecture

## Overview

The Blacksmith rolls system provides a unified 4-function architecture for handling all skill checks, ability checks, saving throws, and tool checks in Foundry VTT. The system supports both window mode (traditional chat-based rolls) and cinema mode (full-screen cinematic experience) with real-time synchronization across all clients.

**CRITICAL PRINCIPLE: Roll calculations are THE PRIMARY INTENT of this tool. Everything else (UI, animations, cinema mode) is icing on the cake, but the system MUST nail roll calculations with 100% accuracy.**

## Roll Calculation Accuracy

### Critical Success Factors

The system's success is measured by **100% accurate roll calculations**. Every roll must include:

#### 1. **Base Roll**: `1d20` (or `2d20kh`/`2d20kl` for advantage/disadvantage)
#### 2. **Ability Modifier**: Character's ability score modifier
#### 3. **Proficiency Bonus**: Added when character is proficient in the roll type
#### 4. **Situational Bonus**: User-defined additional modifiers
#### 5. **Custom Modifiers**: User-defined custom formula additions

#### Roll Type Calculations

**Skills**: `1d20 + abilityMod + profBonus` (if proficient)
**Abilities**: `1d20 + abilityMod + profBonus` (if proficient) 
**Saves**: `1d20 + abilityMod + profBonus` (if proficient)
**Tools**: `1d20 + abilityMod + profBonus` (if proficient)

#### Proficiency Detection
- **Skills**: `actor.system.skills[skillName].value > 0`
- **Abilities**: `actor.system.abilities[abilityName].proficient > 0`
- **Saves**: `actor.system.abilities[abilityName].proficient > 0`
- **Tools**: `toolItem.system.proficient > 0`

#### Formula Validation
Every roll formula is validated to ensure:
- No double `+` signs in formula strings
- Proper parsing of custom modifiers
- Correct ability type identification (str, dex, con, int, wis, cha)
- Accurate total calculation matching displayed breakdown

## Schema-Driven Roll System

### Overview

The system uses a **schema-driven approach** with pure JavaScript implementation, leveraging Foundry's native roll data for maximum accuracy and compatibility.

### Core Files

#### **`dnd5e-roll-rules.js`**
- **Purpose**: Exports D&D 5e roll mechanics as pure JavaScript constants
- **Content**: Complete rules schema including roll types, formulas, advantage/disadvantage, proficiency rules
- **Usage**: Single source of truth for all roll mechanics

#### **`rules-service.js`**
- **Purpose**: Singleton service for feature detection, caching, and rule management
- **Features**:
  - Feature detection from actor items and active effects
  - Automatic cache invalidation on item/effect changes
  - Advantage/disadvantage resolution
  - Proficiency multiplier detection from Foundry roll data
- **Integration**: Exposed via `game.modules.get("coffee-pub-blacksmith").api.rules`

#### **`resolve-check-pipeline.js`**
- **Purpose**: Complete roll resolution pipeline for ability checks
- **Features**:
  - JOAT (Jack of All Trades) - half proficiency, round down
  - Remarkable Athlete - half proficiency, round up (STR/DEX/CON only)
  - Reliable Talent - clamp d20 to 10 minimum (skills only)
  - System roll data integration
  - Advantage/disadvantage normalization
- **Output**: Normalized roll package with formula, modifiers, and labels

#### **`resolve-save-pipeline.js`**
- **Purpose**: Complete saving throw resolution pipeline
- **Features**:
  - Exhaustion effects (level 3+ = disadvantage)
  - Condition auto-fails (STR/DEX when paralyzed/petrified/stunned/unconscious)
  - Cover bonuses (+2/+5 for DEX saves)
  - Concentration DC calculation (max(10, floor(damage/2)))
  - System proficiency integration
- **Output**: Normalized save package with auto-fail detection and DC handling

#### **`resolve-attack-pipeline.js`**
- **Purpose**: Complete attack roll and damage resolution pipeline
- **Features**:
  - Critical hit detection (nat 20)
  - Fumble detection (nat 1 = auto miss)
  - Auto-crit on hit (melee within 5ft vs paralyzed/unconscious)
  - Cover penalties (-2/-5 to hit)
  - Condition effects (invisible, blinded, poisoned, restrained, prone)
  - Exhaustion effects (level 3+ = disadvantage)
  - Damage dice doubling on crit
  - Magic bonus integration
- **Output**: Complete attack package with hit/crit detection and damage formulas

### Roll Resolution Pipeline

#### **1. Feature Detection**
```javascript
// Scans actor items and active effects for class features
const features = api.getFeaturesIndex(actor);
const hasJOAT = features.has("jack-of-all-trades");
const hasRemarkableAthlete = features.has("remarkable-athlete");
```

#### **2. Proficiency Resolution**
```javascript
// Uses Foundry's computed roll data
const profMult = rd.skills[skillId].prof.multiplier; // 0, 0.5, 1, 2
const profValue = profMult === 2 ? profBonus * 2 : 
                  profMult === 1 ? profBonus :
                  profMult === 0.5 ? Math.floor(profBonus / 2) : 0;
```

#### **3. Advantage/Disadvantage Resolution**
```javascript
// Proper D&D 5e cancellation rules
const advState = resolveAdvantage(advSources, disSources);
const formula = advState === "advantage" ? "2d20kh1" : 
                advState === "disadvantage" ? "2d20kl1" : "1d20";
```

#### **4. Roll Assembly**
```javascript
// Complete roll package
return {
  advantageState: "normal"|"advantage"|"disadvantage",
  parts: [abilityMod, profValue, flatBonus],
  labels: ["STR Mod", "Proficiency", "Bonuses"],
  formula: "1d20 + 4 + 2 + 1"
};
```

### Integration Points

#### **Bootstrap in `blacksmith.js`:**
```javascript
import { RulesService } from "./rules/rules-service.js";

Hooks.once("ready", () => {
  const api = RulesService.init("coffee-pub-blacksmith");
  game.modules.get("coffee-pub-blacksmith").api.rules = api;
});
```

#### **Usage in Roll Processing:**

**Ability Checks:**
```javascript
import { resolveCheckPipeline } from "./rules/resolve-check-pipeline.js";

const rollPackage = resolveCheckPipeline(actor, {
  abilityId: "str",
  skillId: "ath",
  advSources: 0,
  disSources: 0,
  flatBonus: 3
});
```

**Saving Throws:**
```javascript
import { resolveSavePipeline } from "./rules/resolve-save-pipeline.js";

const savePackage = resolveSavePipeline(actor, {
  abilityId: "dex",
  cover: "half",         // +2 bonus
  dc: 16,
  advSources: 0,
  disSources: 0
});
```

**Attack Rolls:**
```javascript
import { resolveAttackPipeline } from "./rules/resolve-attack-pipeline.js";

const attackPackage = resolveAttackPipeline(attacker, {
  abilityId: "str",
  proficient: true,
  magicBonus: 1,
  target: { 
    conditions: targetActor, 
    isWithin5ft: true, 
    cover: "none" 
  },
  damageParts: [{ formula: "1d8" }],
  critExtraDice: "1d8"
});
```

### Performance Optimizations

- **Cached feature detection** - Only scans on item/effect changes
- **System roll data integration** - Uses Foundry's pre-computed values
- **Singleton service** - Single instance per module
- **Efficient lookups** - Set-based feature storage

### Complete File Structure

```
scripts/
├── rules/
│   ├── dnd5e-roll-rules.js          // Schema export (JS)
│   ├── rules-service.js             // Singleton service + caching
│   ├── resolve-check-pipeline.js    // Ability checks pipeline
│   ├── resolve-save-pipeline.js     // Saving throws pipeline
│   └── resolve-attack-pipeline.js   // Attack rolls pipeline
├── manager-rolls.js                 // Updated to use new system
└── blacksmith.js                    // Bootstrap integration
```

### Implementation Details

#### **Condition Detection:**
- **Auto-reads** from `actor.allApplicableEffects`
- **Supports custom** condition sets for full control
- **Normalized slugs** for consistent detection

#### **Cover System:**
- **DEX saves**: +2 (half), +5 (three-quarters)
- **Attack rolls**: -2 (half), -5 (three-quarters)
- **Total cover**: Blocks targeting entirely

#### **Critical Hit System:**
- **Natural 20**: Always critical
- **Auto-crit**: Melee within 5ft vs paralyzed/unconscious
- **Damage doubling**: Dice only, modifiers once
- **Extra dice**: Support for Savage Attacks, etc.

#### **Proficiency Integration:**
- **System roll data**: Uses Foundry's computed multipliers
- **Feature detection**: JOAT, Remarkable Athlete, Reliable Talent
- **Proper precedence**: System proficiency overrides features

### Future Extensions

- **Tool proficiency** - Custom tool detection
- **Spell attacks** - Spell-specific critical handling
- **libWrapper integration** - Seamless system replacement
- **Condition effects** - Expanded condition support

## Core Architecture

### 4-Function Roll Flow

The system is built around four core functions that handle the complete roll lifecycle:

```
1. requestRoll()     → Setup and validation
2. orchestrateRoll() → Chat card creation and cinema setup
3. processRoll()     → Actual roll execution
4. deliverRollResults() → Results delivery and updates
```

#### 4-Function Architecture Visual Flow
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                ROLL LIFECYCLE                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ requestRoll │───▶│orchestrateRoll│───▶│ processRoll │───▶│ deliverRollResults │    │
│  │             │    │              │    │             │    │                     │    │
│  │ • Validate  │    │ • Create     │    │ • Execute   │    │ • Update Chat       │    │
│  │ • Prepare   │    │   Chat Card  │    │   Roll      │    │ • Update Cinema     │    │
│  │ • Structure │    │ • Setup      │    │ • 3D Dice   │    │ • Socket Events     │    │
│  │   Data      │    │   Cinema     │    │   Animation │    │ • Group Results     │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                     │                   │                     │              │
│         ▼                     ▼                   ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ Roll Details│    │ Chat Message │    │ Roll Results│    │ Final Display       │    │
│  │ Structure   │    │ + Cinema UI  │    │ + Animation │    │ + Notifications     │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Function Responsibilities

#### 1. `requestRoll(rollDetails)`
**Purpose**: Initial setup and validation of roll parameters
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Validate roll parameters (actors, skills, DCs)
- Prepare roll data structure
- Handle advantage/disadvantage logic
- Return structured roll details for next stage

#### 2. `orchestrateRoll(rollDetails, existingMessageId = null)`
**Purpose**: Create chat cards and setup cinema mode
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Create or update chat message cards
- Handle duplicate card prevention via `existingMessageId`
- Setup cinema mode overlay if requested
- Emit socket events for cross-client synchronization
- Set `rollData.cinemaMode` flag for downstream processing

#### 3. `processRoll(rollData, options)`
**Purpose**: Execute the actual dice roll
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Execute roll using selected system (Blacksmith or Foundry)
- Handle Dice So Nice 3D animations
- Return structured roll results
- Support both manual and automated roll execution

#### 4. `deliverRollResults(rollResults, context)`
**Purpose**: Deliver results to chat and cinema
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Update chat message with roll results
- Handle cinema mode updates via `updateCinemaOverlay()`
- Emit socket events for real-time synchronization
- Call `handleSkillRollUpdate()` for GM processing
- Manage group roll calculations and contested roll logic

## Roll Modes

### Window Mode (Traditional)
**Flow**: Request Roll → Chat Card → Roll Button → Roll Window → Results to Chat
**Characteristics**:
- Standard Foundry VTT chat-based interface
- Roll configuration window for situational modifiers
- Results displayed in chat message
- Supports individual and group rolls

#### Window Mode Visual Flow
```
┌─────────────────┐    ┌──────────────┐     ┌─────────────┐     ┌──────────────┐    ┌─────────────┐
│   Request Roll  │───▶│  Chat Card   │───▶│ Roll Button │───▶│ Roll Window  │───▶│ Results to  │
│   (Skill Check) │    │   Created    │     │   Clicked   │     │   Opens      │    │    Chat     │
└─────────────────┘    └──────────────┘     └─────────────┘     └──────────────┘    └─────────────┘
         │                       │                   │                   │                   │
         ▼                       ▼                   ▼                   ▼                   ▼
   requestRoll()         orchestrateRoll()    processRoll()      deliverRollResults()   Chat Update
```

### Cinema Mode (Cinematic)
**Flow**: Request Roll → Chat Card + Cinema Overlay → Roll Button → Results to Chat + Cinema
**Characteristics**:
- Full-screen cinematic overlay
- Real-time dice animations
- Individual actor cards with results
- Group success/failure overlays
- Auto-close after results display
- Background images based on roll type

#### Cinema Mode Visual Flow
```
┌─────────────────┐    ┌─────────────────────────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐
│   Request Roll  │───▶│        Chat Card +              │───▶│ Roll Button │───▶│        Results to               │
│   (Cinema Mode) │    │      Cinema Overlay             │    │   Clicked   │    │     Chat + Cinema               │
└─────────────────┘    └─────────────────────────────────┘    └─────────────┘    └─────────────────────────────────┘
         │                       │                                   │                           │
         ▼                       ▼                                   ▼                           ▼
   requestRoll()         orchestrateRoll()                    processRoll()              deliverRollResults()
                                │                                   │                           │
                                ▼                                   ▼                           ▼
                        showCinemaOverlay()                Dice So Nice 3D              updateCinemaOverlay()
                                                           Animation                    + Chat Update
```

## Data Flow Architecture

### Roll Data Structure
```javascript
rollData = {
    actors: [],           // Array of actor data
    challengerRollType: 'skill',  // Type of roll
    challengerRollValue: 'str',   // Specific skill/ability
    defenderRollType: null,       // For contested rolls
    defenderRollValue: null,      // For contested rolls
    isCinematic: false,           // Cinema mode flag
    rollTitle: 'Skill Check',     // Display title
    rollFormula: '1d20 + 4',      // Dice formula
    rollTotal: '?',               // Result (initially unknown)
    cinemaMode: false             // Set by orchestrateRoll()
}
```

### Context Structure
```javascript
context = {
    messageId: 'abc123',          // Chat message ID
    tokenId: 'def456',            // Token ID for cinema updates
    rollType: 'skill',            // Type of roll
    isGroupRoll: false,           // Group roll flag
    isContestedRoll: false        // Contested roll flag
}
```

#### Data Flow Visual Flow
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                DATA FLOW ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ Roll Data   │    │ Context      │    │ Roll        │    │ Results             │    │
│  │ Structure   │    │ Structure    │    │ Execution   │    │ Structure           │    │
│  │             │    │              │    │             │    │                     │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                     │                   │                     │              │
│         ▼                     ▼                   ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ • actors[]  │    │ • messageId  │    │ • Roll      │    │ • Roll Results      │    │
│  │ • rollType  │    │ • tokenId    │    │   Object    │    │ • Chat Updates      │    │
│  │ • formula   │    │ • rollType   │    │ • Dice      │    │ • Cinema Updates    │    │
│  │ • cinema    │    │ • groupFlag  │    │   Results   │    │ • Socket Events     │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Cinema Mode Architecture

### Cinema Overlay Management

#### `showCinemaOverlay(rollData)`
**Purpose**: Display the cinema mode interface
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Import `SkillCheckDialog` class
- Call `SkillCheckDialog._showCinematicDisplay()`
- Convert roll data to message format
- Handle background image selection

#### `updateCinemaOverlay(rollResults, context)`
**Purpose**: Update cinema display with roll results
**Location**: `scripts/manager-rolls.js`
**Responsibilities**:
- Find cinema overlay and actor cards
- Update individual roll results
- Detect critical hits and fumbles
- Play sound effects and apply CSS animations
- Handle group roll results display
- Manage auto-close timing

### Cinema Display Features

#### Individual Roll Updates
- Real-time result display
- Critical hit detection (d20 = 20)
- Fumble detection (d20 = 1)
- Sound effects (crit/fumble/complete)
- CSS animations (pulse for crits, shake for fumbles)

#### Group Roll Results
- Success/failure overlay display
- Background images (success/failure/tie)
- Progress indicators ("X of Y Succeeded")
- Auto-close after 5 seconds
- Contested roll support

#### Cinema Mode Architecture Visual Flow
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              CINEMA MODE ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ showCinema  │    │ Cinema       │    │ Individual  │    │ Group Results       │    │
│  │ Overlay     │    │ Display      │    │ Roll        │    │ Display             │    │
│  │             │    │ Setup        │    │ Updates     │    │                     │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                     │                   │                     │              │
│         ▼                     ▼                   ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ Background  │    │ Actor Cards  │    │ Crit/Fumble │    │ Success/Failure     │    │
│  │ Images      │    │ + Dice       │    │ Detection   │    │ Overlay             │    │
│  │ Selection   │    │ Animation    │    │ + Effects   │    │ + Auto-close        │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Socket Architecture

### Real-Time Synchronization

The system uses SocketLib for cross-client communication:

#### Socket Events
- `updateSkillRoll` - Roll result updates
- `showCinematicOverlay` - Cinema mode activation
- `closeCinematicOverlay` - Cinema mode deactivation
- `skillRollFinalized` - Roll completion notification

#### Socket Flow
1. **GM executes roll** → `emitRollUpdate()` → Socket to all clients
2. **Clients receive update** → `updateCinemaOverlay()` → Local cinema update
3. **GM processes results** → `handleSkillRollUpdate()` → Group calculations
4. **Results broadcast** → Socket to all clients → Final display updates

#### Socket Architecture Visual Flow
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              SOCKET SYNCHRONIZATION                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │     GM      │    │   SocketLib  │    │   Clients   │    │   Final Display     │    │
│  │   Client    │    │   Events     │    │  (Players)  │    │   Updates           │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                     │                   │                     │              │
│         ▼                     ▼                   ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ Execute     │───▶│ emitRollUpdate│───▶│ Receive     │───▶│ updateCinemaOverlay │    │
│  │ Roll        │    │ Socket Event  │    │ Socket      │    │ Local Cinema        │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│         │                     │                   │                     │              │
│         ▼                     ▼                   ▼                     ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────┐    │
│  │ handleSkill │    │ Group        │    │ Real-time   │    │ Auto-close          │    │
│  │ RollUpdate  │    │ Calculations │    │ Sync        │    │ + Results           │    │
│  └─────────────┘    └──────────────┘    └─────────────┘    └─────────────────────┘    │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## System Integration

### Roll System Selection

The system supports two roll execution methods:

#### Blacksmith System (Default)
- Custom roll logic with advantage/disadvantage
- Manual Roll creation
- Full control over dice mechanics
- Enhanced tool integration

#### Foundry System (Future)
- Native Foundry VTT roll system
- Standard D&D 5e mechanics
- Built-in advantage/disadvantage
- System compatibility

### Setting Integration
```javascript
const useBlacksmithSystem = game.settings.get(MODULE.ID, 'diceRollToolSystem') === 'blacksmith';
```

## Error Handling

### Graceful Degradation
- Fallback to window mode if cinema fails
- Socket timeout handling
- Template loading error recovery
- Dice animation failure handling

### Debug Logging
- Comprehensive logging via `postConsoleAndNotification()`
- Debug flag support for verbose output
- Error tracking and reporting
- Performance monitoring

## Performance Considerations

### Optimization Strategies
- Template caching for repeated use
- Socket event batching
- Efficient DOM updates
- Minimal re-renders

### Memory Management
- Cleanup of cinema overlays
- Socket event deregistration
- Template cache expiration
- Event listener cleanup

## Migration Status

### Completed Migrations
- ✅ 4-function architecture implementation
- ✅ Cinema mode integration
- ✅ Socket synchronization
- ✅ Critical hit/fumble detection
- ✅ Group roll results display
- ✅ Auto-close functionality
- ✅ Old system code removal

### Pending Tasks
- [ ] Foundry system integration
- [ ] System selection respect
- [ ] Enhanced error handling
- [ ] Performance optimization

---

## Migration Plan (Roll System)

This section is the roll system migration plan: current status, root cause analysis, phased implementation, and progress tracking. It was merged from the standalone migration plan document.

### Current Status

**Critical fix completed:** Duplicate card creation bug fixed; window mode roll flow works. The roll system is in a transitional state: new 4-function architecture is implemented and working for some entry points; window mode is now functional after fixes.

**What's working:** Socket system operational (SocketLib); cross-client communication; new 4-function architecture in `manager-rolls.js`; roll execution logic; chat card system and chat card click integration.

**Partially working:** Cinema mode (overlay shows, roll execution complete but some polish pending); Roll Window class (exists, integration improved).

**Broken / incomplete:** Query window integration still uses old system; system selection (`diceRollToolSystem`) not respected in `processRoll()` (hardcoded to Blacksmith).

**Summary:** Socket system production ready; cross-client sync functional; new architecture implemented; chat card integration working; window mode fixed; cinema mode implemented; query integration and system selection remain.

### Detailed Technical Analysis

**Architecture mismatch:** Target is a unified flow (Request → Route → Presentation → Unified Execution → Unified Resolution). In practice there were two paths: (1) Chat card clicks → `orchestrateRoll()` → new 4-function system ✅ (2) Window mode → `RollWindow` → old patterns ❌. Window mode has been fixed to use the new system; query window still needs updating.

**Function status:**

| Function | Status | Integration |
|----------|--------|-------------|
| `requestRoll()` | ✅ Complete | Used by chat cards |
| `orchestrateRoll()` | ✅ Complete | Used by chat cards, window, cinema |
| `processRoll()` | ✅ Complete | Used by chat cards, window, cinema; system selection not yet respected |
| `deliverRollResults()` | ✅ Complete | Used by chat cards, window, cinema |
| `showRollWindow()` | ✅ Fixed | Uses new flow |
| `showCinemaOverlay()` | ✅ Implemented | Roll execution connected |

**Socket integration:** New system uses `emitRollUpdate()` and `deliverRollResults()`; old direct socket calls should be removed from any remaining code paths (e.g. query window when updated).

### Root Cause Analysis

**Primary:** Migration from old system to 4-function architecture was partially completed (new functions + chat card + window + cinema done; query window and system selection remain).

**Secondary:** Architectural inconsistency—two competing paths—addressed for window and cinema; query window and system selection still to do.

**Critical issues addressed:** (1) Window mode broken → fixed. (2) Cinema mode incomplete → implemented. (3) Query window integration missing → pending. (4) Socket pattern inconsistency → reduced; query and any legacy paths to be unified.

### Phased Implementation Plan

#### Phase 1: Critical Fixes

- **1.1 Fix Window Mode Integration** ✅ Completed  
  - Duplicate card fix (existingMessageId), connect `RollWindow._performRoll()` to new system, test window mode and cross-client sync, window polish (size, background, Dice So Nice).
- **1.2 Complete Cinema Mode Implementation** ✅ Completed  
  - Roll execution in cinema, overlay functions, end-to-end testing, cross-client sync, cinema polish (success/fail overlay, animation timing, crit/fumble effects).
- **1.3 Update Query Window Integration** (pending)  
  - Modify `window-query.js` to use `orchestrateRoll()`; replace direct `SkillCheckDialog` creation; test and verify cross-client sync.

#### Phase 2: Architecture Unification

- **2.1 Unify Execution Paths**  
  - Audit all entry points; ensure each uses `orchestrateRoll()` → `processRoll()` → `deliverRollResults()`; remove old socket patterns; document unified path.
- **2.2 Complete Migration**  
  - Fix system selection: `processRoll()` respects `diceRollToolSystem`, implement `_executeFoundryRoll()` if needed, add selection logic. Remove old roll execution code; clean legacy patterns; ensure single source of truth in `manager-rolls.js`.

#### Phase 3: Validation and Cleanup

- **3.1 End-to-End Testing**  
  - Test all entry points (dialog, cinema, query, chat cards); verify cross-client sync; validate window and cinema use same execution path.
- **3.2 Legacy Code Removal**  
  - Remove `utils-rolls-OLD.js` if present; clean remaining old functions; optimize and document final system.

#### Phase 4: Production Readiness

- **4.1 Performance Optimization** – Roll execution and memory usage.
- **4.2 Error Handling and Resilience** – Comprehensive error handling, network resilience.
- **4.3 User Experience Polish** – Chat card tooltips/sounds, cinema crit/fumble effects, window polish, accessibility.
- **4.4 Documentation and Maintenance** – API docs, roll guide, troubleshooting, code quality and tests.

### Function Specifications (Current Status)

**Implemented and working:** `requestRoll()`, `orchestrateRoll()`, `processRoll()`, `deliverRollResults()` — used by chat cards, window mode, and cinema mode.

**Helper functions:** `_executeBuiltInRoll()`, `prepareRollData()`, `emitRollUpdate()`.

**Pending:** Query window to use `orchestrateRoll()`; `processRoll()` to respect `diceRollToolSystem` and support Foundry roll path when selected.

### Success Metrics

- **Technical:** Socket communication ✅; roll execution ✅ (chat cards, window, cinema); chat card updates ✅; cross-client sync ✅; query window ❌ pending; system selection ❌ pending.
- **User experience:** Rolls complete and display correctly for window and cinema; query to be aligned; error handling in place.
- **Development:** Code maintainable; functions separated; extension points clear; performance to be validated after query and system-selection work.

### Risk Assessment

- **High risk (addressed):** Window mode integration ✅ fixed; cinema mode roll execution ✅ implemented.
- **Remaining:** Query window integration; system selection respect.
- **Low risk:** Socket communication; cross-client sync; chat card integration.

**Mitigation:** Incremental fixes, test each change, keep fallbacks until new path proven, user feedback after fixes.

### Progress Tracking

- **Phase 1:** 1.1 Window mode ✅; 1.2 Cinema mode ✅; 1.3 Query window pending.
- **Phase 2–4:** Architecture unification, validation, production readiness — pending.

**Critical path:** (1) Socket system ✅ (2) Phase 1.1 Window mode ✅ (3) Phase 1.2 Cinema mode ✅ (4) Phase 1.3 Query window (5) Phase 2–4.

**Success criteria (summary):** Phase 1 complete when window, cinema, and query all use the new flow and cross-client sync works. Phase 2 when all entry points use the same path and old patterns are removed. Phase 3 when tested and legacy removed. Phase 4 when performance, error handling, UX polish, and docs are complete.

**Last updated:** Current session — window and cinema flows implemented and functional.  
**Next milestone:** Phase 1.3 Query window integration; then system selection and Phase 2–4.

---

## File Structure

### Core Files
- `scripts/manager-rolls.js` - Main roll system (4 functions)
- `scripts/window-skillcheck.js` - UI components and cinema display
- `scripts/manager-sockets.js` - Socket event handling
- `scripts/blacksmith.js` - GM roll processing and group calculations

### Supporting Files
- `scripts/api-core.js` - Logging and utilities
- `scripts/const.js` - Constants and configuration
- `scripts/settings.js` - User preferences
- `styles/window-roll-cinematic.css` - Cinema mode styling

### Templates
- `templates/skill-check-card.hbs` - Chat card template
- `templates/window-roll-normal.hbs` - Roll window template
- `templates/window-skillcheck.hbs` - Skill check dialog template

## API Reference

### Public Functions

#### `requestRoll(rollDetails)`
```javascript
const rollDetails = await requestRoll({
    actors: [...],
    challengerRollType: 'skill',
    challengerRollValue: 'str',
    isCinematic: true
});
```

#### `orchestrateRoll(rollDetails, existingMessageId)`
```javascript
await orchestrateRoll(rollDetails, 'existing-message-id');
```

#### `processRoll(rollData, options)`
```javascript
const rollResults = await processRoll(rollData, {
    advantage: true,
    disadvantage: false,
    fastForward: true
});
```

#### `deliverRollResults(rollResults, context)`
```javascript
await deliverRollResults(rollResults, {
    messageId: 'abc123',
    tokenId: 'def456'
});
```

### Internal Functions

#### `updateCinemaOverlay(rollResults, context)`
- Updates cinema display with roll results
- Handles critical hits and fumbles
- Manages group roll results
- Controls auto-close timing

#### `showCinemaOverlay(rollData)`
- Displays cinema mode interface
- Handles background image selection
- Manages overlay positioning

#### `emitRollUpdate(rollDataForSocket)`
- Emits socket events for synchronization
- Handles cross-client communication
- Manages roll result broadcasting

## Testing

### Test Scenarios
1. **Individual Rolls**: Single actor, single roll
2. **Group Rolls**: Multiple actors, group success/failure
3. **Contested Rolls**: Two sides, winner determination
4. **Cinema Mode**: Full-screen cinematic experience
5. **Critical Hits**: d20 = 20 detection and effects
6. **Fumbles**: d20 = 1 detection and effects
7. **Socket Sync**: Cross-client real-time updates
8. **Error Handling**: Graceful failure recovery

### Debug Commands
```javascript
// Enable debug logging
game.settings.set(MODULE.ID, 'debugHooks', true);

// Test roll system
const rollDetails = await requestRoll({...});
```

## Future Enhancements

### Planned Features
- Enhanced roll customization
- Advanced group roll mechanics
- Improved cinema mode animations
- Better error recovery
- Performance optimizations
- Additional roll types

### Integration Opportunities
- Combat system integration
- Character sheet enhancements
- Module compatibility improvements
- API expansion for third-party modules
