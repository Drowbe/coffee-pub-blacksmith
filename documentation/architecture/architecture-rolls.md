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

## Requester-supplied roll parameters

A roll request can carry parameters the roller did not choose: `situationalBonus`, `customModifier`,
`rollAdvantage`, and `lockRollAdvantage`. They all travel the same channel, and it is the **chat message
flags**, not a function argument — the request is created on one client and the roll happens later on
another, so the ChatMessage is the only thing both sides share.

```
API options -> messageData (flags: request-level + per entry of flags.actors)
            -> handleChatMessageClick reads the flags back  (window-skillcheck.js:2694)
            -> orchestrateRoll(rollDetails)                 (manager-rolls.js:212)
            -> showRollWindow / _showCinematicDisplay
            -> { advantage, disadvantage, situationalBonus, customModifier } into processRoll
```

Each parameter is written twice: request-level on `messageData`, and per actor on each entry of
`messageData.actors`. The per-actor value wins, which is what lets one request give two actors different
conditions. `SkillCheckDialog.resolveRollAdvantage(actorData, flags)` (`window-skillcheck.js:154`) is the
single place that resolution happens; both roll surfaces call it rather than repeating the fallback.

`rollAdvantage` is one field taking `advantage` / `disadvantage` / `normal` rather than two booleans,
because `normal` has to be requestable — a requester whose modifiers cancelled out is asking for a straight
`1d20`, which two false booleans cannot distinguish from an unspecified request. `normalizeRollAdvantage`
(`window-skillcheck.js:114`) maps anything else to null, meaning unrestricted.

Enforcement lives at the buttons, not in the roll path. `processRoll` still receives only the
`{ advantage, disadvantage }` pair built from whichever button was clicked, and knows nothing about what was
requested. A request that sets `lockRollAdvantage` renders only the requested button in both surfaces; the
click handlers additionally refuse a mismatched mode, which matters only when a click reaches them through
stale DOM.

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

## The dice builder (Request a Roll, DICE tab)

The DICE tab is not a list you pick one thing from. It is one row per die -- a count starting at zero and an optional label -- plus one flat modifier row, and the sum of the non-zero rows is the request.

**The rows are the state.** `_readDiceTerms` reads counts and labels back out of the inputs in document order; there is no parallel object mirroring them. A mirror would be a second thing to keep in step with the screen, and the failure when it drifts is silent: a request that rolls something other than what the summary said. Term order is therefore row order, which is why `2d10 + 1d4` passed in by an API caller comes back displayed as `1d4 + 2d10` — the sum is the same and the display order belongs to the builder.

**Building is selecting.** There is no separate "which die is chosen" state, because a count above zero already says it. `_syncDiceBuilder` sets `selectedType`/`selectedValue`/`selectedRollTitle` **and both contested sides** when the build is non-empty, and clears all three when it empties. The corollary is load-bearing: choosing any other roll type must call `_resetDiceBuild`, which is why the check-item handler, the quick-roll handler, and the tool handler all do. A build sets *both* sides, so one left behind is still the defender's roll after a skill is clicked as challenger — a contested request rolling a formula that is no longer on screen.

`_composeDiceBuild` returns three strings from the same term list:

| | | |
|---|---|---|
| `formula` | `2d10[Strength] + 1d4[Bludgeoning] + 10` | what gets rolled and what is stored |
| `plainFormula` | `2d10 + 1d4 + 10` | the fallback, and what the icon is chosen from |
| `title` | `2d10 Strength + 1d4 Bludgeoning + 10` | the request's title |

The bracket convention is the one `RollWindow.parseModifierTerms` already uses for the roll window's modifier field, and it is also Foundry's own flavour syntax, so a label reaches the roll's tooltip. `Roll.validate` is asked before the labelled form is trusted — a label is user prose reaching a formula, and the cost of being wrong is a request nobody can roll — so a rejected label falls back to `plainFormula`. Brackets are stripped from label text because they are the delimiter: a `]` inside a label ends it early and the rest of the formula becomes garbage.

The summary is built as DOM, not as an HTML string. The labels are the user's prose and `textContent` is the one way to put prose on a page that cannot also put markup there.

Three couplings that are easy to break by accident:

- **The favourite button must not carry `cpb-favorite-toggle`.** A capture-phase listener on the dialog claims that class for check items and calls `stopPropagation`, which would swallow the builder's own click. The dice heart favourites the whole formula through a synthetic check-item element (`_diceFavoriteElement`), so `_computeFavoriteId`, the favourites list, and `executeFavoriteSilent` handle it without knowing the builder exists. Favourites saved by the old per-die hearts still execute — they are `{type: 'dice', value: 'd6'}` and go down the silent path.
- **Advantage on dice rolls is a string match.** `_executeBuiltInRoll` swaps in `2d20kh`/`2d20kl` only when the formula is exactly `1d20` or `d20`. One plain d20 composes to `1d20`, so it still works; a labelled or multiplied d20 does not.
- **The dialog cannot import `manager-rolls.js`.** That module imports the dialog, so the edge runs one way only. `getDiceIcon` lives in `api-core.js` for exactly this reason, next to `showDiceAnimation`.

`node tools/check-dice-builder.mjs` guards the compose/parse pair and the template rows the reader depends on. It slices the real functions out of the source rather than reimplementing them, so it cannot pass against a copy that has drifted.

## System selection

`processRoll` destructures a `system` value from the roll data, but currently always calls `_executeBuiltInRoll` — the Blacksmith roller. There is no Foundry execution path (no `_executeFoundryRoll` exists), so the `diceRollToolSystem` setting does not currently change behavior. `orchestrateRoll` reads and stores the setting (`:178,191`), but `processRoll` does not act on it.

```javascript
const useBlacksmithSystem = game.settings.get(MODULE.ID, 'diceRollToolSystem') === 'blacksmith';
```

## Public vs internal surface

- **Public (on `module.api`):**
  - `openRequestRollDialog` — Request a Roll dialog; see `../api/api-requestroll.md`.
  - `rolls` (`RollsAPI`) — outcome classification and hooks; see `../api/api-rolls.md`.
- **Exported for internal use:** `orchestrateRoll` (`:134`), `processRoll` (`:259`), `deliverRollResults` (`:327`), `updateCinemaOverlay` (`:1408`).
- **Module-private:** `showRollWindow` (`:1030`), `showCinemaOverlay` (`:1343`), `emitRollUpdate` (`:1707`), `_executeBuiltInRoll` (`:622`).

External modules drive roll *requests* through `openRequestRollDialog`. They react to roll *meaning* through `module.api.rolls` hooks or `rolls.classify()`. Internal orchestration functions are not exposed.

## Outcome classification

Roll meaning (crit, fumble, success vs DC, hit/miss vs AC) is centralized in `scripts/utility-roll-classification.js` and exposed via `scripts/api-rolls.js`.

**Previously duplicated in four places**, which the classifier consolidates:

| Site | Role |
|---|---|
| `utility-roll-classification.js` | **Authority** — `extractActiveD20`, `classify()`, `buildSkillCheckOutcome` |
| `blacksmith.js` `handleSkillRollUpdate` | GM group/contested recalc; emits `blacksmith.rolls.skillCheckResolved` |
| `manager-rolls.js` | Sounds/cinema d20 — migrated to `extractActiveD20` (Phase 2) |
| `utility-message-resolution.js` | Attack hit/miss from chat messages — consumed by `classify()` |
| `utility-midi-resolution.js` | MIDI crit/fumble — consumed by `classify()` and stats |

**Hooks (subscription surface):**

- `blacksmith.rolls.resolved`
- `blacksmith.rolls.skillCheckResolved`
- `blacksmith.rolls.attackResolved` — emitted by `manager-roll-outcomes.js` (core dnd5e chat + optional MIDI)
- `blacksmith.rolls.groupResolved`

**Not in Blacksmith:** The Query Tool (`window-query.js`) lives in **Regent**, not this repo. Regent integrates with rolls via the public API only.

## Files

- `scripts/manager-rolls.js` — the roll system (the three flow functions plus cinema and socket helpers).
- `scripts/window-skillcheck.js` — the skill-check dialog, card creation, and cinema display.
- `scripts/blacksmith.js` — `openRequestRollDialog` (public entry) and `handleSkillRollUpdate` (GM group/contested processing).
- `scripts/utility-roll-classification.js` — shared classification internals.
- `scripts/api-rolls.js` — public `module.api.rolls` surface.
- `scripts/manager-roll-outcomes.js` — attack hook emission (core chat lane + optional MIDI).
- `scripts/manager-sockets.js` — socket transport.
- `templates/skill-check-card.hbs`, `templates/window-roll-normal.hbs`, `templates/window-skillcheck.hbs` — card and window templates.
- `styles/window-roll-cinematic.css` — cinema styling.
