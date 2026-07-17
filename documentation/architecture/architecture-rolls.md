# Blacksmith Rolls Architecture

**Audience:** Contributors to the Blacksmith codebase.

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


> **A "Schema-Driven Roll System" section was removed here on 2026-07-17 — it was fiction.**
>
> It described `scripts/rules/` (`dnd5e-roll-rules.js`, `rules-service.js`, and three resolve-pipelines),
> a `RulesService`, an `api.rules` surface, and D&D 5e feature handling for Jack of All Trades,
> Remarkable Athlete, Reliable Talent, cover, auto-crit and exhaustion. **None of it has ever existed.**
> `git log --all -- scripts/rules` returns no commits: that directory has never been created, in any
> revision. All 19 named symbols are at zero occurrences repo-wide.
>
> It was the largest section in this document and the most dangerous kind of wrong — plausible,
> specific, and confidently describing feature resolution this module does not implement.
> Recoverable from git history if it is ever wanted as a design sketch; it does not belong in
> an architecture doc. Real roll calculation is documented above and in `scripts/manager-rolls.js`.

## Core Architecture

### Roll Flow — three functions, not four

> ### ⚠️ Corrections (2026-07-17) — read before trusting the diagrams below
>
> The rest of this section still describes a **"4-Function Architecture"**. It is wrong in three load-bearing ways, and the ASCII diagrams below encode all three. They are left in place only because rewriting them properly needs a session with the code; **the text below is the authority, not the art.**
>
> **1. `requestRoll()` does not exist.** It is commented out in `manager-rolls.js:26`, under a banner the code wrote itself: *"THIS IS A LEGACY FUNCTION AND IS NO LONGER USED. IT IS KEPT HERE FOR REFERENCE ONLY. Step 1 happens in the skillcheck dialog."* Every reference to it below — the flow list, both diagrams, the "Public Functions" entry, the usage examples — describes a function that cannot be called. **The real flow is three functions:**
>
> ```
> 1. orchestrateRoll()    → packages data, selects system, chooses mode
> 2. processRoll()        → executes the roll
> 3. deliverRollResults() → delivers results, updates cards/overlays
> ```
>
> Chat-card creation happens **upstream in `window-skillcheck.js`**, which calls `orchestrateRoll` (`window-skillcheck.js:2598`).
>
> **2. `orchestrateRoll()` cannot create chat cards — it throws without one.** The doc calls `existingMessageId` an optional duplicate-guard. It is mandatory: `manager-rolls.js:156-159` throws *"No existing message ID provided - chat card must be created first by skillcheck dialog."* `orchestrateRoll` also contains **no socket calls at all**.
>
> **3. The socket direction is inverted.** The doc says *"GM executes roll → emitRollUpdate → socket to all clients."* Reality is **roller → broadcast → GM acts**: any user rolls, `deliverRollResults` emits *to* the GM (`:349-355`), `emitRollUpdate` is `executeForOthers` (`:1713`), and GM-side authority lives in `handleSkillRollUpdate` (`blacksmith.js:2364`). The GM is authoritative for **group calculations only**, not execution. The roller also updates its own overlay locally first and is deliberately excluded from the broadcast, to avoid double timers (`:360-373`) — real architecture this doc omits.
>
> Also: the "Public/Internal" split further down is **exactly inverted** — `updateCinemaOverlay` *is* exported (`:1408`); `showCinemaOverlay` (`:1343`), `showRollWindow` (`:1030`) and `emitRollUpdate` (`:1707`) are module-private. None are on `module.api`; the real public surface is `openRequestRollDialog` (see `api-requestroll.md`).

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

### Pending Tasks
- [ ] Foundry system integration
- [ ] System selection respect
- [ ] Enhanced error handling
- [ ] Performance optimization

---


> **A 99-line "Migration Plan (Roll System)" was removed here on 2026-07-17.**
>
> Repo rule: plans are scaffolding and must not masquerade as architecture. It carried Phases 1-4,
> a risk assessment (with a duplicated line — a tell that it was merged in and never reread),
> progress checkboxes, and success metrics. It referenced `TODO.md` eight times **from this
> directory, where no such file exists**, and named two phantom files (`window-query.js`,
> `utils-rolls-OLD.js`) that appear in zero commits.
>
> **One real finding was rescued from it before deletion** and is now tracked in
> `documentation/TODO.md`: `processRoll()` ignores the `diceRollToolSystem` setting.
> `orchestrateRoll` reads and stores it (`manager-rolls.js:178,191`), `processRoll` destructures
> `system` (`:263`) and then unconditionally calls `_executeBuiltInRoll` (`:271`).
> `_executeFoundryRoll` is unimplemented. That is a live bug, not architecture.

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
