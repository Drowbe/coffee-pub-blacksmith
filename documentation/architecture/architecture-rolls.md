# Blacksmith Rolls Architecture

**Audience:** Contributors to the Blacksmith codebase.

## Overview

The rolls system handles all skill checks, ability checks, saving throws, and tool checks. It supports a window mode (chat-based rolls) and a cinema mode (full-screen cinematic overlay), synchronized across clients over sockets.

Roll calculation is the primary intent of this system. UI, animations, and cinema mode sit on top of it, but the calculation must be correct in every case. That accuracy is the reason the system builds formulas by hand (see below) rather than delegating to the dnd5e system roller.

The live entry point every consumer uses is `openRequestRollDialog` (`blacksmith.js:968`, exposed on `module.api`) — documented in `../api/api-requestroll.md`. The functions described here are internal; they are driven by `window-skillcheck.js`, not called directly by other modules.

## Roll calculation

Formulas are assembled in `_executeBuiltInRoll()` (`scripts/manager-rolls.js:622`). That function is the authority for the exact field access; the summary here is the intent.

Every roll is `base + abilityMod + profBonus` where:

- **Base:** `1d20`, or `2d20kh` (advantage) / `2d20kl` (disadvantage).
- **Ability modifier:** the character's modifier for the roll's ability.
- **Proficiency bonus:** `actor.system.attributes.prof`, added only when the character is proficient in the roll type.
- **Situational / custom modifiers:** user-supplied additions from the roll window.

Proficiency is detected per roll type:

- **Skills:** `actor.system.skills[value].value > 0`
- **Abilities / Saves:** `actor.system.abilities[value].proficient > 0`
- **Tools:** the tool item's `system.proficient > 0`

Skills, abilities, saves, and tools all use the same `base + abilityMod + profBonus` shape.

## Roll flow — three functions

The live flow is three exported functions in `manager-rolls.js`:

```
orchestrateRoll()    -> package data, select system, choose window/cinema mode
processRoll()        -> execute the roll (build formula, roll dice, DSN animation)
deliverRollResults() -> deliver results, update chat card / cinema overlay, broadcast
```

A fourth function, `requestRoll()`, is commented out at `manager-rolls.js:26` and marked legacy in the code ("THIS IS A LEGACY FUNCTION AND IS NO LONGER USED"). Do not reintroduce it. Its old job — creating the chat card — now happens upstream in `window-skillcheck.js`, which creates the card and then calls `orchestrateRoll` (`window-skillcheck.js:2598`).

### `orchestrateRoll(rollDetails, existingMessageId = null)` — `:134`

Packages roll data, resolves the actor, selects the roll system, and sets the cinema flag. Despite the default parameter, `existingMessageId` is **required**: with no id, the function throws ("No existing message ID provided - chat card must be created first by skillcheck dialog", `:156-159`). It creates no chat cards and makes no socket calls of its own.

### `processRoll(rollData, rollOptions)` — `:259`

Executes the roll: builds the formula in `_executeBuiltInRoll` (`:622`), rolls, and runs the Dice So Nice animation if present. Returns a structured result.

### `deliverRollResults(rollResults, context)` — `:327`

Updates the chat card with the result, updates the cinema overlay, and drives cross-client sync (see Sockets). It also triggers the GM-side group/contested calculation via `handleSkillRollUpdate` (`blacksmith.js:2406`).

## Roll modes

**Window mode.** Skill-check dialog creates the card, the card's roll button opens the roll window, the player confirms modifiers, the roll executes, and the result is written back to the chat card.

```
skillcheck dialog -> chat card -> roll button -> roll window -> orchestrateRoll -> processRoll -> deliverRollResults -> chat card updated
```

**Cinema mode.** Same flow, plus a full-screen overlay. `orchestrateRoll` sets the cinema flag; `showCinemaOverlay` (`:1343`) builds the overlay; `updateCinemaOverlay` (`:1408`) writes results into it, detects crits (d20 = 20) and fumbles (d20 = 1), plays sound and CSS effects, shows group success/failure, and manages auto-close.

## Sockets

The system uses SocketLib (via `SocketManager.getSocket()`). Live socket events:

- `updateSkillRoll` — a roll result, broadcast so the GM can act on it.
- `updateCinemaOverlay` — cinema overlay updates, broadcast by the GM to other clients.
- `skillRollFinalized` — roll completion (`blacksmith.js:2521`).

The direction is **roller -> GM**, not GM -> clients:

1. Any user rolls. `deliverRollResults` calls `emitRollUpdate` (`:1707`), which is `socket.executeForOthers("updateSkillRoll", ...)` (`:1713`).
2. The GM's `handleSkillRollUpdate` (`blacksmith.js:2406`) receives it and performs the authoritative group/contested calculation. If the roller *is* the GM, `deliverRollResults` calls the handler directly (`if (game.user.isGM)`).
3. For cinema, the GM broadcasts `updateCinemaOverlay` to other clients (`:365-375`). The roller updates its own overlay locally first and is deliberately excluded from that broadcast, to avoid double-running timers.

The GM is authoritative for group and contested *calculations* only. Individual roll execution runs on whichever client rolled.

`showCinematicOverlay` and `closeCinematicOverlay` appear only in the commented-out legacy block — they are not live events.

## System selection

`processRoll` destructures a `system` value from the roll data, but currently always calls `_executeBuiltInRoll` — the Blacksmith roller. There is no Foundry execution path (no `_executeFoundryRoll` exists), so the `diceRollToolSystem` setting does not currently change behavior. `orchestrateRoll` reads and stores the setting (`:178,191`), but `processRoll` does not act on it.

```javascript
const useBlacksmithSystem = game.settings.get(MODULE.ID, 'diceRollToolSystem') === 'blacksmith';
```

## Public vs internal surface

- **Public (on `module.api`):** `openRequestRollDialog` only — see `../api/api-requestroll.md`.
- **Exported for internal use:** `orchestrateRoll` (`:134`), `processRoll` (`:259`), `deliverRollResults` (`:327`), `updateCinemaOverlay` (`:1408`).
- **Module-private:** `showRollWindow` (`:1030`), `showCinemaOverlay` (`:1343`), `emitRollUpdate` (`:1707`), `_executeBuiltInRoll` (`:622`).

None of the internal roll functions are exposed to other modules; external code drives rolls through the request-roll dialog.

## Files

- `scripts/manager-rolls.js` — the roll system (the three flow functions plus cinema and socket helpers).
- `scripts/window-skillcheck.js` — the skill-check dialog, card creation, and cinema display.
- `scripts/blacksmith.js` — `openRequestRollDialog` (public entry) and `handleSkillRollUpdate` (GM group/contested processing).
- `scripts/manager-sockets.js` — socket transport.
- `templates/skill-check-card.hbs`, `templates/window-roll-normal.hbs`, `templates/window-skillcheck.hbs` — card and window templates.
- `styles/window-roll-cinematic.css` — cinema styling.
