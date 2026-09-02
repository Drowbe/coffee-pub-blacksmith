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

## Quick Rolls: the library behind the QUICK tab

The QUICK tab was twenty-four `<div class="cpb-check-item" data-type="quick" …>` rows written out by hand
in `templates/window-skillcheck.hbs`. A GM could not add one, change one, or remove one. They are data now,
in `scripts/manager-quick-rolls.js`, and the Roll Builder (`scripts/window-rollbuilder.js`) is what edits
them.

**World-scoped** (`requestRollQuickRolls`), because this is the table's roll library rather than one
person's preferences: a second GM sees the same list and the rolls travel with the world. Favourites stay
`user`, since a favourite is a personal shortcut to a shared thing. A separate `requestRollQuickRollsSeeded`
flag records that the built-ins have been planted, so a GM who deletes all twenty-four does not find them
back next launch — and so "which ones ship as defaults" can change later without disturbing a table's own
list.

`QuickRollsManager.normalize()` runs on **read**, not just on write. These are hand-editable world settings
that outlive the shape that wrote them, and a missing field has to render as a sane row rather than as
`undefined` in a label.

### The generated rows keep the markup's `data-*` contract

`_quickRollRow` emits the same attributes the hand-written rows had. That is load-bearing: four things read
that dataset — `_handleQuickRollItem`, `_computeFavoriteId`, `_favoriteRecordFromItem`, and the search
filter — and a different shape would have meant changing all four at once while orphaning every favourite
saved before the change.

Two attributes are subtler than they look:

- **`data-dc` is set only when there is one.** The handler reads the attribute's *presence* as "override
  the window's DC box", so an empty string blanks the DC on a roll that meant to inherit it.
- **`data-targets` is on every row.** For a normal roll, who rolls folds into `data-roll-type`
  (`party` / `individual`), which is the vocabulary the handler has always spoken; a contest spends
  `rollType` on saying it is a contest, so the answer has to travel separately.

Row selection listeners live in `_attachCheckItemListeners(root, scope)` and are idempotent
(`data-cpb-selection-bound`). The rows are redrawn whenever the library changes, and a redraw that did not
re-wire would leave rows that look right and do nothing.

### Firing without the window

Every quick roll used to open the dialog, drive its DOM, and close it again — a window flashing open and
shut on the way to a chat card. None of that was necessary. `resolveQuickRollActors` decides:

| Roll | Resolves to |
|---|---|
| normal + party | every player character, tokened or not |
| normal + selected | the controlled tokens |
| contested + party | party as challengers, other controlled tokens as defenders |
| contested + selected | **null** — the window opens |

The last row is the point. In the window a GM marks defenders by right-clicking them; that is a judgement,
not data, and guessing would send half the party against the other half. `runQuickRoll` falls back to
`pendingQuickRollId` for that case, for a roll with nobody to make it, and for anything the silent path
refuses — a roll the GM asked for is worth a window rather than a toast.

`createRequestRoll` gained `defenderType` / `defenderValue` and decides `hasMultipleGroups` **from the
actors it was handed** rather than from an option: two groups among them is what a contest is. It refuses
group success on a contest, because `handleSkillRollUpdate` runs the group and contest calculations as
independent `if` blocks and would otherwise compute two verdicts for one card.

### Marks, and why they are not decoration

Each row shows contested / group / individual, the DC when there is one, and cinematic or chat card, in
front of the description. The three facts that change what a click *does* were otherwise visible only if the
GM had written them into the label, and the built-ins mostly had not — "DC 15 Perception Check" says nothing
about group success or about taking over the table's screen. Two rows could look identical and behave
differently, which is the one thing a list you fire from must not do.

### One menubar entry for rolling

Dice Tray and Request a Roll were two icons a pixel apart doing the same job, and Manual Rolls was a button
under the sidebar's pin. All three are now the dice tool (`scripts/window-dicetray.js`):

- **Left click** differs by role — a player gets the Dice Tray, a GM gets Request a Roll. Neither is shut
  out of the other's tool; everything is one right-click away.
- **Right click** carries Request a Roll (GM), Open Dice Tray, the manual-rolls toggle, then favourites and
  the quick roll library as flyouts.
- **The icon goes `rgba(231, 91, 1, 0.9)` while manual rolls are on**, through
  `MenuBar.updateMenubarToolIconColor`. It has to be told, on three paths: at registration (manual rolls
  survive a reload), on toggle, and from a `core.diceConfiguration` settings hook — that last one is the
  single branch of the old sidebar button's hook that had to survive the move.
- `requestRollShowInMenubar` now decides whether this tool *leads* with the request window, rather than
  whether a second icon appears.

`SidebarStyle` keeps the manual-rolls **engine** — rewriting core's `diceConfiguration` and coaxing Foundry
into applying it is fiddly and version-sensitive — and exposes `canToggleManualRolls()`,
`isManualRollsEnabled()`, `toggleManualRolls()`. The two `sidebarManualRolls*` settings still gate it and
keep their keys: they gate the same capability, and only its home changed.

**`window-dicetray.js` importing `window-skillcheck.js` closes an import cycle** that runs back through
`blacksmith.js`. It is safe because nothing there touches either binding at module-evaluation time — every
use is inside a click handler or a menu builder. Needing one at evaluation would break it silently, as
`undefined` in whichever file the graph reaches second.

### Portability

Export writes an envelope — `{ type, version, exportedAt, world, rolls }` — so a reader can tell the file
from the other JSON a Foundry user has lying around, and a future format has somewhere to say so.
`parseImport` accepts a bare array too, since that is what somebody hand-assembling a file writes. Import
asks merge-or-replace rather than choosing; merging matches on id, so re-importing your own export updates
rather than doubles, and two worlds carrying the built-ins agree about them because those ids are derived
from what the roll is (`qr-party-prc-group`) rather than generated per world.

### The Roll Builder is a Tool window

`BlacksmithToolWindowBaseV2` rendering into the shared `templates/window-tool-template.hbs`, per
`../api/api-window.md` — the contract for a small utility opened from an in-flow action. The shell owns the
root, the scrolling body, the footer, the theming, and every form control inside it;
`styles/window-rollbuilder.css` carries **no colour literals**, because the Tool surfaces are per-theme
custom properties and any literal is right in one theme and wrong in the other two. Ephemeral, so it takes a
distinct `id` per instance and `rememberPosition: false`, per the documented rules for one.

`node tools/check-quick-rolls.mjs` guards all of the above: the row/reader contract, the built-in roll
counts, the export/import round trip, the resolution table, the contested wiring in the silent path, the
Tool-window contract, and the menubar consolidation.

## The dice builder (Request a Roll, DICE tab)

The DICE tab is not a list you pick one thing from. It is one row per die -- a count starting at zero and an optional label -- plus one flat modifier row, a name, and a list of remembered rolls. The sum of the non-zero rows is the request.

**The rows are the state.** `_readDiceTerms` reads counts, labels, and order stamps back out of the inputs; there is no parallel object mirroring them. A mirror would be a second thing to keep in step with the screen, and the failure when it drifts is silent: a request that rolls something other than what the summary said.

**Term order is the order the dice were set**, not the order of the rows. `_stampDiceOrder` writes a monotonic counter onto `data-dice-order` when a row's count leaves zero and deletes it when the count returns, and `_readDiceTerms` sorts by that stamp. Monotonic rather than positional, so removing the first die does not renumber the survivors -- they keep the order the GM still sees. The flat modifier is appended last regardless, because that is how a formula is written. `_applyDiceBuild` stamps from a parsed build's `order` array, which is how a remembered roll reopens reading the way it was saved.

**Building is selecting.** There is no separate "which die is chosen" state, because a count above zero already says it -- which is also why an active row wears the same `rgba(40, 108, 24, 0.4)` as a selected contestant and a challenger roll. `_syncDiceBuilder` sets `selectedType`/`selectedValue`/`selectedRollTitle`/`selectedDiceDisplay` **and both contested sides** when the build is non-empty, and clears them when it empties. The corollary is load-bearing: choosing any other roll type must call `_resetDiceBuild`, which is why the check-item handler, the quick-roll handler, and the tool handler all do. A build sets *both* sides, so one left behind is still the defender's roll after a skill is clicked as challenger — a contested request rolling a formula that is no longer on screen.

`_composeDiceBuild` returns four strings from the same term list:

| | | |
|---|---|---|
| `formula` | `2d10[Strength] + 1d4[Bludgeoning] + 10` | what gets rolled, and what a remembered roll stores |
| `plainFormula` | `2d10 + 1d4 + 10` | the fallback, and what the icon is chosen from |
| `display` | `2d10 Strength + 1d4 Bludgeoning + 10` | shown on the card and the cinematic plate |
| `name` | `Sneak Attack` | the request's title; `Custom Dice Roll` when unnamed |

**The name and the formula are different things and both reach the card.** `messageData.rollTitle` is the name and `messageData.rollFormula` is the display line. On the card they share the "what was asked for" band -- formula as `lead`, DC as `text` -- and on the cinematic plate the formula is a `subtitleParts` entry immediately before the DC. Neither is enough alone: "Sneak Attack" says nothing about the dice, and a title that is only the formula names nothing. `diceFormulaDisplay` is the single implementation of "brackets read as words", used by the builder and by the silent API path, which has only the string.

The bracket convention is the one `RollWindow.parseModifierTerms` already uses for the roll window's modifier field, and it is also Foundry's own flavour syntax, so a label reaches the roll's tooltip. `Roll.validate` is asked before the labelled form is trusted — a label is user prose reaching a formula, and the cost of being wrong is a request nobody can roll — so a rejected label falls back to `plainFormula`. Brackets are stripped from label text because they are the delimiter: a `]` inside a label ends it early and the rest of the formula becomes garbage.

**Remembering is not favouriting.** Remembered rolls live in `skillCheckPreferences.requestRollSavedDice` and render under the builder; favourites live in `requestRollFavorites` and render in the Quick tab. The heart is per remembered row precisely so that keeping a roll for tonight does not promote it beside Perception and Death Save. A remembered row's click loads it back into the rows rather than firing it, since editing is usually why it was kept. Both stores key on `_computeFavoriteId` of the same synthetic check-item element (`_diceFavoriteElement`), so a remembered roll and its favourite share an id and the heart can tell whether it is lit.

The summary and the saved rows are built as DOM, not as HTML strings. The labels and names are the user's prose, and `textContent` is the one way to put prose on a page that cannot also put markup there.

Three couplings that are easy to break by accident:

- **A favourite carries how it plays, and the flag must reach every dispatch branch.** `rec.isCinematic` rides on the favourite record and on the row's `data-cinematic`, but NOT in `_computeFavoriteId` — toggling it has to edit the favourite in place, not mint a second one. `_executeFavoriteFromRecord` builds a separate options object per roll type and each must spread it; a branch that forgets posts to chat, which is the default and therefore silent. The button is `cpb-favorite-cinematic` and must never also be `cpb-favorite-toggle`, for the capture-listener reason below.
- **Nothing in the dice section may carry `cpb-favorite-toggle`.** A capture-phase listener on the dialog claims that class for check items and calls `stopPropagation`, which would swallow the builder's own clicks. The saved rows use `cpb-dice-saved-heart`. Favourites saved by the old per-die hearts still execute — they are `{type: 'dice', value: 'd6'}` and go down the silent path.
- **Advantage on dice rolls is a string match.** `_executeBuiltInRoll` swaps in `2d20kh`/`2d20kl` only when the formula is exactly `1d20` or `d20`. One plain d20 composes to `1d20`, so it still works; a labelled or multiplied d20 does not.
- **`prepareRollData` must special-case `dice`, and nothing downstream will tell you if it stops.** It feeds the Roll Configuration window's formula line only; `_executeBuiltInRoll` reads the request's value directly. So when it hardcoded `1d20` and added an ability modifier for every type (falling back to `int`), the window read `1D20 + 2 INT` while the correct dice fell and the correct tooltip appeared afterwards. A dice roll has no base d20, no ability modifier and no proficiency, and `_setupFormulaUpdates` renders its formula term by term through `RollWindow.parseModifierTerms` -- which works because the builder writes labels in the same `2d10[Strength]` shape the modifier field does.
- **The dialog cannot import `manager-rolls.js`.** That module imports the dialog, so the edge runs one way only. `getDiceIcon` lives in `api-core.js` for exactly this reason, next to `showDiceAnimation`.

`node tools/check-dice-builder.mjs` guards the compose/parse pair, the order contract, and the controls the builder wires by selector. It slices the real functions out of the source rather than reimplementing them, so it cannot pass against a copy that has drifted.

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
- `scripts/window-skillcheck.js` — the skill-check dialog, card creation, cinema display, the quick roll rows, and the silent request path.
- `scripts/manager-quick-rolls.js` — the quick roll library: shape, storage, CRUD, the built-ins, export and import.
- `scripts/window-rollbuilder.js` — the Roll Builder Tool window, with `templates/window-rollbuilder.hbs` and `styles/window-rollbuilder.css`.
- `scripts/window-dicetray.js` — the dice menubar tool: its two left-click roles, its context menu, and the manual-rolls icon state.
- `scripts/ui-sidebar-style.js` — the manual-rolls engine (`canToggleManualRolls`, `isManualRollsEnabled`, `toggleManualRolls`).
- `scripts/blacksmith.js` — `openRequestRollDialog` (public entry) and `handleSkillRollUpdate` (GM group/contested processing).
- `scripts/utility-roll-classification.js` — shared classification internals.
- `scripts/api-rolls.js` — public `module.api.rolls` surface.
- `scripts/manager-roll-outcomes.js` — attack hook emission (core chat lane + optional MIDI).
- `scripts/manager-sockets.js` — socket transport.
- `templates/skill-check-card.hbs`, `templates/window-roll-normal.hbs`, `templates/window-skillcheck.hbs` — card and window templates.
- `styles/window-roll-cinematic.css` — cinema styling.
- `tools/check-quick-rolls.mjs`, `tools/check-dice-builder.mjs` — the invariant checks for both features.
