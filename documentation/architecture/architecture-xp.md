# XP Distribution System Architecture

**Audience:** Contributors to the Blacksmith codebase.

## Where resolution evidence comes from

XP is awarded per adversary, scaled by a resolution the GM can override in the window. Resolution is
decided by `XpManager.detectMonsterResolution`, which reads hit points: at or below zero is `DEFEATED`,
below maximum is `ESCAPED`, at maximum is `IGNORED`. `NEGOTIATED` and `CAPTURED` are never auto-assigned.

**Deriving that from live documents at award time is not safe, and the reason is not obvious.**
`Combatant#actor` falls back to the base prototype actor when its token no longer exists
(`client/documents/combatant.mjs:84-87`), and a prototype is at full health because combat damage lives in
the token's delta and is destroyed with the token. So a monster that was killed and then had its token
removed re-derives as undamaged and earns nothing. That is not a rare state: looting a corpse mid-fight and
clearing the token is ordinary table practice, and it is what a consuming module does when a body is emptied.

So the resolution inputs are recorded as combat proceeds, in `scripts/stats-adversaries.js`.

**The record is evidence, not verdict.** It stores hit points, maximum hit points and defeated state -- never
a resolution, a multiplier or an XP figure. `detectMonsterResolution` still decides what those mean, so a GM
correcting a resolution in the window, or a table changing its multiplier settings afterwards, is not arguing
with a frozen answer. Adding a stored `resolutionType` would break that, which is why the harness asserts the
field is absent.

**Keyed on combatant id**, not actor id: an unlinked token carries the base actor's id, so two tokens of one
prototype are indistinguishable by it -- exactly the case the record exists to get right.

**Persisted on the Combat document** as a flag, because sessions stop mid-combat and in-memory state does not
survive a reload. It is read back off the document passed to the `deleteCombat` hook, which is what makes the
automatic award work after `game.combat` is already null.

Three capture points, and each covers something the others cannot:

| Hook | Catches |
|---|---|
| `preDeleteToken` | The last moment a token's hit points exist anywhere. After the delete the actor resolves to the prototype and the evidence is unrecoverable. |
| `preDeleteCombatant` | A GM toggling a corpse out of the tracker, which deletes the combatant outright and would otherwise lose the row entirely rather than just its resolution. |
| `updateCombat` | Everything else as the fight progresses -- damage taken, a GM marking something defeated, a combatant added mid-combat. |

**CR resolves the other way round.** `getMonsterCR` prefers the live actor and falls back to the record only
when there is no actor at all. The live document is normally right for CR even after a token is deleted, since
a prototype's CR is usually the CR that was fought, and preferring live means a GM correcting a wrong CR still
applies. The record is there to stop the no-actor case returning 0, which reads as "worth nothing" rather than
"we lost its CR".

**The display name resolves the same way as resolution, and for the same reason.** `Combatant#name` is a
stored field that, when empty, derives as `token?.name || actor?.name`
(`client/documents/combatant.mjs:159`). For an unlinked token the actor fallback is the **prototype** name, so
an adversary placed from a "Cult Leader" prototype and renamed to something specific reverts to the prototype
in the XP window the instant its token is deleted. `getMonsterDisplayName` prefers the live name while a
token exists -- so a rename mid-combat is picked up at once -- and the recorded name only when there is no
token left to ask.

**The name is also stamped onto the Combatant, because the XP window is not the only surface that reverts.**
The combat tracker shows the prototype name too, a moment after the corpse is cleared rather than
immediately -- the derivation runs on the next data preparation, not on the delete, which is why it appears to
change on its own. Reading the record cannot fix that, since the tracker reads `Combatant#name`.

So `AdversaryRecord.stampName` writes the derived name into the field it derives *into*, on
`preDeleteToken`. `||=` leaves a populated value alone, so the derivation stops and both surfaces keep the
name. It never overwrites a name already stored -- that is a GM's explicit rename.

This was initially rejected as too invasive and then adopted once the tracker was shown doing it. The
reasoning that changed: populating a field Foundry declares in the Combatant schema is not a hack, and the
write lands on the Combatant rather than the Combat, so it does not interact with the sweep below.

## What the record is actually for

Worth stating precisely, because it is easy to over-credit. `defeated` is a stored BooleanField on the
Combatant (`common/documents/combatant.mjs:56`), so it survives token deletion and a reload with no help from
anything here -- and `detectMonsterResolution` consults `Combatant#isDefeated` directly and first. A killed
adversary reads `DEFEATED` because of that, not because of the record.

The record is needed for what is **not** stored anywhere:

- The **display name**, once the token that carried it is gone.
- **Hit points**, which distinguish `ESCAPED` from `IGNORED` for anything that lived. Nothing on the
  Combatant records how hurt something was.
- A **CR fallback** for a combatant whose actor cannot be resolved at all.
- Combatants **deleted outright**, which take their stored `defeated` flag with them.

## Never replace good evidence with degraded evidence

A combatant whose token is gone can only produce a worse snapshot: its actor resolves to the prototype, so hit
points read as full and the name reads as the prototype's. So both capture paths **skip a combatant that has
no token when an entry already exists**.

Without that rule the periodic sweep destroys the thing it maintains. It re-snapshots every combatant on each
`updateCombat`, so the round after a corpse is cleared it overwrote the name and hit points captured while the
token was alive. That presented as resolution surviving a reload while the name did not -- because `defeated`
is stored on the Combatant and survived independently, masking the loss of everything else in the entry.

**Read every value before the first await.** `preDeleteToken` is not awaited by Foundry -- a pre-hook returning
a promise does not delay the delete -- so the token disappears while the handler is still running. The first
version of `captureForToken` awaited a server round trip and then read the name for the stamp, which by then
resolved to the prototype: it wrote "Cult Leader" over the name it existed to preserve. Snapshots and the
display name are now taken synchronously up front, and `stampName` receives the name rather than re-deriving it.

## The sweep must not write unconditionally

`AdversaryRecord` writes to a flag on the **Combat** document, and the periodic sweep is registered on
`updateCombat`. A flag write updates the Combat, which fires `updateCombat`, which runs the sweep, which
writes again -- a loop with a server round trip per iteration.

Two guards, deliberately both:

- **The record compares before writing** and returns when nothing changed. This is what makes the cycle
  terminate, and it does not depend on Foundry short-circuiting a no-op update -- which is not a behaviour to
  bet on.
- **The sweep ignores its own write**, recognising `ADVERSARY_FLAG_PATH` in the hook's `changed` argument.
  This only avoids a wasted round trip; it is not the thing that stops the loop.

Either alone would work today and leave the code one edit away from a runaway write. A harness check asserts
that five sweeps with nothing changed produce zero writes, and that a real change still produces one.

Worth knowing about the sweep's reach: `updateCombat` fires on round and turn changes, not on damage --
hit point changes are Actor updates. The sweep is a coarse refresh, and the capture that actually matters is
`preDeleteToken`, which fires at the one moment the evidence is about to become unrecoverable.

**The menubar path is best-effort by nature.** `openXpDistributionWindow` with no active combat lists canvas
tokens rather than a recorded encounter -- a corpse cleared during the fight is simply absent, and anything
that wandered in since is present. It logs that it is doing so. Awarding at combat end is the correct path;
this one exists so the window can be opened at all.

## Dead tokens are excluded from threat, deliberately

`EncounterManager.canStillFight` is the single predicate for "does this token still contribute threat", and it
carries a rules asymmetry rather than a modelling convenience: a monster at zero is out of the fight, while a
player character at zero is **dying** -- making death saves, one action from being restored, and still
something the enemy must account for. Anything explicitly marked defeated is out on either side.

Two consumers apply it:

- **Create Combat** (`api-menubar.js`) filters it out of the tokens it adds. Without that, a new encounter
  starts with the previous fight's bodies, because the tool falls back to every placeable on the canvas when
  nothing is selected. A GM who wants a corpse in the tracker adds it deliberately.
- **Encounter CR and difficulty** pass `onlyStanding: true`. Note this is an option on `getPartyCR` and
  `getMonsterCR` that defaults to **false**, so a caller that omits it counts corpses as threats. Every
  in-repo caller now passes it; the default is left alone because those functions are on the public API and
  flipping it would silently change results for consumers.

## Overview

The XP Distribution system is a dual-mode experience point allocation tool for FoundryVTT that supports both monster-based XP (Experience Points mode) and manual milestone XP (Milestones mode). The system can operate in combat mode (when combat is active) or non-combat mode (when opened from the menubar).

## Core Components

### 1. XpManager Class (`scripts/xp-manager.js`)

The main static class that handles XP distribution logic and provides the public API.

#### Key Static Methods:
- `openXpDistributionWindow()` - Entry point for opening the XP distribution window
- `getCombatMonsters(combat)` - Retrieves monsters from active combat
- `getCanvasMonsters()` - Retrieves all NPC tokens from the current scene
- `loadPartyMembers()` - Loads player character data
- `getMonsterBaseXp(monster)` - Calculates base XP from monster CR
- `getResolutionMultipliers()` - Returns XP multipliers for each resolution type
- `applyXpToPlayersFromData(xpData)` - Applies calculated XP to player actors
- `postXpResults(xpData, results)` - Posts XP distribution results to chat

### 2. XpDistributionWindow Class (`scripts/xp-manager.js`)

The window that provides the user interface for XP distribution. It extends `BlacksmithWindowBaseV2` (`xp-manager.js:823`), not `FormApplication`.

#### Key Instance Methods:
- `updateXpCalculations()` - Core calculation engine
- `_updateXpDisplay()` - Updates UI display elements
- `_updateXpDataPlayers()` - Updates player data and displays
- `_onMonsterResolutionIconClick()` - Handles monster resolution changes
- `_onModeToggleChange()` - Handles Experience Points/Milestones toggle
- `_onApplyXp()` - Handles XP distribution to players

## Data Structures

### xpData Object
```javascript
{
    modeExperiencePoints: boolean,    // Experience Points mode enabled
    modeMilestone: boolean,          // Milestones mode enabled
    milestoneXp: number,             // Manual milestone XP amount
    milestoneData: {                 // Milestone form data
        category: string,
        title: string,
        description: string,
        xpAmount: string
    },
    monsters: [                      // Array of monster data
        {
            id: string,              // Actor ID
            actorId: string,          // Actor ID (duplicate for template)
            name: string,             // Monster name
            img: string,              // Monster image
            cr: number,               // Challenge Rating
            baseXp: number,           // Base XP from CR
            resolutionType: string,   // DEFEATED, NEGOTIATED, etc.
            multiplier: number,       // XP multiplier (0.0-1.5)
            finalXp: number,          // Calculated final XP
            isIncluded: boolean       // Include in calculations
        }
    ],
    players: [                       // Array of player data
        {
            actorId: string,          // Actor ID
            name: string,             // Player name
            img: string,              // Player portrait
            level: number,            // Character level
            currentXp: number,        // Current XP
            finalXp: number          // Final XP after distribution
        }
    ],
    partySize: number,               // Number of players
    partyMultiplier: number,         // Party size multiplier
    totalXp: number,                 // Total monster XP
    adjustedTotalXp: number,         // Total XP after party multiplier
    combinedXp: number,              // Monster XP + Milestone XP
    xpPerPlayer: number              // XP per player
}
```

## System Flow

### 1. Initial Load Flow
```
openXpDistributionWindow()
├── Check for active combat
├── Load party members (loadPartyMembers)
├── Load monsters:
│   ├── Combat mode: getCombatMonsters() + detectMonsterResolution()
│   └── Non-combat mode: getCanvasMonsters() (all REMOVED)
├── Create xpData object with default values
├── Create XpDistributionWindow instance
├── Constructor calls updateXpCalculations()
└── Render window
```

### 2. Monster Resolution Change Flow
```
User clicks resolution icon
├── _onMonsterResolutionIconClick()
├── Update monster data:
│   ├── resolutionType = newResolution
│   ├── multiplier = getResolutionMultipliers()[resolution]
│   └── finalXp = Math.floor(baseXp * multiplier)
├── Update visual icons (active/dimmed classes)
├── Call _updateXpDisplay()
└── Call _updateXpDataPlayers()
```

### 3. XP Calculation Flow
```
_updateXpDisplay()
├── Call updateXpCalculations()
├── Recalculate totals:
│   ├── totalXp = sum of monster.finalXp
│   └── adjustedTotalXp = totalXp * partyMultiplier
├── Update summary display elements
└── Update monster row displays

updateXpCalculations()
├── Calculate monsterBucket = modeExperiencePoints ? adjustedTotalXp : 0
├── Calculate milestoneBucket = modeMilestone ? milestoneXp : 0
├── combinedXp = monsterBucket + milestoneBucket
└── xpPerPlayer = combinedXp / partySize
```

### 4. Player Data Update Flow
```
_updateXpDataPlayers()
├── For each player:
│   ├── Get inclusion status from UI
│   ├── Get adjustment value from input
│   ├── Get adjustment sign (+/-)
│   ├── Calculate finalXp = xpPerPlayer + signedAdjustment
│   └── Update player.finalXp
└── Update player row displays
```

### 5. XP Distribution Flow
```
User clicks "Distribute XP"
├── _onApplyXp()
├── Collect milestone data (_collectMilestoneData)
├── Call applyXpToPlayersFromData(xpData)
├── Update player actors with new XP
├── Generate results array with level-up info
├── Call postXpResults(xpData, results)
└── Post chat message with distribution results
```

## Resolution Types and Multipliers

### Monster resolution types

Each resolution multiplies the monster's base XP. Five of the six are **GM-configurable settings**, read at calculation time by `getResolutionMultipliers()`; `REMOVED` is hardcoded to `0.0` and cannot be configured.

| Resolution | Setting | Default |
|---|---|---|
| DEFEATED (combat victory) | `xpMultiplierDefeated` | 1.0 |
| NEGOTIATED (diplomatic success) | `xpMultiplierNegotiated` | 1.0 |
| CAPTURED (tactical success) | `xpMultiplierCaptured` | 1.0 |
| ESCAPED (monster retreated) | `xpMultiplierEscaped` | 0.5 |
| IGNORED (avoided entirely) | `xpMultiplierIgnored` | 0.0 |
| REMOVED (excluded entirely) | not configurable | 0.0 |

`xp-manager.js` also defines a static `RESOLUTION_XP_MULTIPLIERS` constant carrying the same default values, but the calculation path does not read it — read the settings, not the constant.

### Party size multipliers

`getPartySizeMultipliers()` branches on the `xpPartySizeHandling` setting (default `'dnd5e'`):

- **`'dnd5e'`** — the D&D 5e standard curve from the static `PARTY_SIZE_MULTIPLIERS`: 1 player 1.0, 2 players 1.5, 3 players 2.0, 4 players 2.5, 5 players 2.0, 6 players 1.5, 7 players 1.25, 8 players 1.0.
- **`'equal'`** — every party size is `1`, so XP divides equally with no size scaling.

## CR to XP Conversion

The system uses a decimal-based CR to XP conversion table:

```javascript
CR_TO_XP = {
    0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
    5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
    13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
    21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000,
    29: 135000, 30: 155000
}
```

## Mode Behavior

### Combat Mode (hasCombat = true)
- **Default**: Experience Points ON, Milestones OFF
- **Monsters**: Loaded from combat with auto-detected resolutions
- **Data Source**: Combat tracker

### Non-Combat Mode (hasCombat = false)
- **Default**: Experience Points OFF, Milestones ON
- **Monsters**: Loaded from canvas, all set to REMOVED initially
- **Data Source**: Scene tokens

## UI Components

### Templates
- `templates/window-xp.hbs` - Main XP distribution window
- `templates/cards-xp.hbs` - Chat message template for XP results

### CSS Classes
- `.xp-distribution.foundry-style-window` - Main window container
- `.xp-header-sticky` - Sticky header section
- `.xp-body-scroll` - Scrollable middle section
- `.xp-footer` - Sticky footer with action buttons
- `.xp-section` - Content sections (monsters, players, milestones)
- `.hidden` - Hidden sections (display: none !important)

## Event Handlers

### Mode Toggles
- `_onModeToggleChange()` - Handles Experience Points/Milestones toggle changes
- Shows/hides relevant sections
- Calls `updateXpCalculations()`

### Monster Interactions
- `_onMonsterResolutionIconClick()` - Handles resolution icon clicks
- Updates monster data and calls recalculation methods

### Player Interactions
- `_onPlayerInclusionClick()` - Handles player inclusion/exclusion
- `_onPlayerAdjustmentChange()` - Handles XP adjustment input
- `_onPlayerAdjustmentSignClick()` - Handles +/- adjustment buttons

### Milestone Interactions
- `_onMilestoneXpChange()` - Handles milestone XP input
- `_onMilestoneDataChange()` - Handles milestone form changes
- `_collectMilestoneData()` - Collects milestone form data

## Integration Points

### FoundryVTT API
- `game.actors` - Actor data access
- `game.combat` - Combat state
- `game.scenes.active` - Scene data
- `BlacksmithWindowBaseV2` - window base class (Blacksmith's Application V2 base)
- `ChatMessage` - Chat posting
- `renderTemplate` - Template rendering

### Module Integration
- Menubar API - XP Distribution button
- HookManager - Combat end hooks
- postConsoleAndNotification - Logging system
