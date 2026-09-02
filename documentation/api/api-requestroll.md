# Request a Roll API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

## Overview

The Request a Roll API lets external modules open Blacksmith's **Request a Roll** (Skill Check) dialog programmatically and optionally pre-fill its state. The dialog is the same one opened by the "Request a Roll" toolbar tool and menubar entry: it lets the GM choose a roll type (skill, ability, save, or tool), select actors (challengers/defenders), set a DC, and send a roll request to chat.

Request Roll presentation is now driven by an internal feature theme file:

- world setting: `requestRollThemeJson`
- default file: `modules/coffee-pub-blacksmith/themes/request-roll/theme-requestroll.json`
- current top-level arrays: `cinematicBanners` and `sounds`

This theme file is for Blacksmith's internal Request Roll presentation. It is not part of the shared external asset API and should not be treated as a cross-module `BlacksmithConstants` or `AssetLookup` surface.

Use this API when your module needs to:
- Open the Request a Roll dialog from a button, macro, or hook
- **Create a roll request without opening the dialog** (silent mode) — post the request card to chat immediately
- Pre-select a roll type (e.g. Perception, Stealth, Strength save)
- Set a default DC or actor filter (selected tokens vs party)
- Pre-check the "Group roll" option (e.g. for party group checks)
- Override the dialog title for context (e.g. "Spot the trap")
- State the advantage or disadvantage the roll is made under, globally or per actor
- Put your own explanation of the roll's conditions on the request card

## Getting Started

### Accessing the API

Via `game.modules` — no imports, good for the browser console:

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const dialog = api?.openRequestRollDialog({ initialSkill: 'perception' });
```

Or via the Blacksmith API bridge — async, waits for the API to be ready:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

const dialog = await BlacksmithAPI.openRequestRollDialog({
    title: 'Spot the trap',
    initialType: 'skill',
    initialValue: 'perception',
    dc: 15
});
```

### API Availability Check

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (!api?.openRequestRollDialog) {
    console.warn('Blacksmith Request a Roll API not available');
    return;
}
api.openRequestRollDialog({ initialSkill: 'stealth' });
```

## API Reference

### `openRequestRollDialog(options?)`

Opens the Request a Roll (Skill Check) dialog. Optionally pass an options object to pre-fill the dialog (roll type, DC, actor filter, title). The dialog is the same Application used by the toolbar and menubar; users can change any value before submitting.

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `Object` | Optional. All properties are optional. |
| `options.silent` | `boolean` | If `true`, the dialog is not opened; the roll request is created immediately and posted to chat. Requires `initialValue` or `initialSkill`. Actors come from `initialFilter` ('party' \| 'selected') or from `options.actors`. Returns a Promise resolving to `{ message, messageId }` (module API returns that Promise; drop-in API resolves with it). **If no actors are found** (e.g. no tokens on the scene or none matching the filter), the API falls back to opening the dialog instead of throwing, and the Promise resolves with `{ message: null, messageId: null, fallbackDialog }` so callers can detect the fallback. |
| `options.title` | `string` | Override the dialog window title (e.g. `"Spot the trap"`). |
| `options.initialType` | `string` | Pre-select the roll type: `'skill'`, `'ability'`, `'save'`, or `'dice'`. |
| `options.defenderType` | `string` | **Silent mode only.** The defenders' roll type in a contested request. Defaults to `initialType`. |
| `options.defenderValue` | `string` | **Silent mode only.** The defenders' roll value. Omit to have both sides roll the same thing. Only takes effect when the actors carry two groups — see *Contested requests* below. |
| `options.initialValue` | `string` | Id or friendly name for that type. You can pass the system's CONFIG id (e.g. `'prc'` for Perception in D&D 5e) or a friendly/localized name (e.g. `'perception'`); the dialog resolves it automatically. Skills: `'perception'`, `'stealth'`, `'insight'`, etc.; abilities: `'str'`, `'dex'`, `'con'`, `'int'`, `'wis'`, `'cha'`; saves: same as abilities plus `'death'`; dice: a formula such as `'2d6+10'`. |
| `options.initialSkill` | `string` | **Legacy.** Same as `initialType: 'skill'` with `initialValue` set to this (e.g. `'perception'`). |
| `options.dc` | `number` or `string` | Default DC value shown in the dialog's DC field. |
| `options.initialFilter` | `string` | Which actor list is active: `'selected'` (only selected tokens) or `'party'` (party filter). When `'party'`, all visible party actors are also pre-selected as challengers. |
| `options.groupRoll` | `boolean` | If `true`, the "Group roll" checkbox is checked (multiple challengers roll as a group); if `false`, it is unchecked. **When omitted:** in **dialog** mode the checkbox is unchecked; in **silent** mode, if multiple actors are supplied (via `actors` or `initialFilter`), group roll defaults to `true` unless you pass `groupRoll: false`. |
| `options.situationalBonus` | `number` | Optional. Pre-filled in the **Roll Configuration** window's "Situational Bonus" field. When using `initialFilter` or the dialog, this value applies to **all** actors. When using `options.actors`, this is the **default** for any actor that does not specify its own `situationalBonus`. |
| `options.customModifier` | `string` | Optional. Pre-filled in the **Roll Configuration** window's "Custom Modifier" field (e.g. `"+2"`, `"-1"`). Same scope as `situationalBonus`: all actors when using filter/dialog, or default when using `options.actors`. |
| `options.rollAdvantage` | `string` | Optional. The advantage mode the request asks for: `'advantage'`, `'disadvantage'`, or `'normal'`. Applies to all actors when using the dialog or `initialFilter`, and is the default for any actor in `options.actors` that does not set its own. The requested button is pre-selected and marked in both the Roll Configuration window and the cinematic overlay, and the mode is shown on the chat card; all three buttons stay live unless `lockRollAdvantage` is also set. Unrecognized values are ignored, leaving the roll unrestricted. Note this is unrelated to `options.rollMode`, which is Foundry's roll privacy. |
| `options.lockRollAdvantage` | `boolean` | Optional. When `true` and `rollAdvantage` is set, only the requested button is rendered in the Roll Configuration window and the cinematic overlay, and a roll of any other mode is refused with a warning notification. Request-level only; it applies to every actor's requested mode, including per-actor overrides. Default `false` (pre-select without restricting). |
| `options.explanation` | `string` | Optional. Requester-authored prose rendered on the chat card under an "About this Roll" header, and under the title in cinematic mode. Independent of `showRollExplanation`: set either, both, or neither. Rendered as plain text — markup is escaped, not interpreted. |
| `options.callback` | `Function` | **Not implemented — does nothing.** The value is stored on the dialog and never invoked anywhere. Use `options.onRollComplete` or the `blacksmith.requestRollComplete` hook instead. |
| `options.onRollComplete` | `Function` | Callback invoked each time a roll result is delivered to the chat card on the local client that registered it. Receives one argument: `(payload)` where `payload` is `{ messageId, message, messageData, tokenId, result, allComplete, requesterId, rollerUserId }`. Called once per roll; unregistered when `allComplete` is true or its request ChatMessage is deleted. Blacksmith retains at most 100 incomplete local callbacks as a final abandoned-card safeguard. For cross-client/GM-authoritative handling, use the global hook `Hooks.on('blacksmith.requestRollComplete', ...)`. |
| `options.actors` | `Array` | Optional actor list. When **silent** mode is used, this is the preferred way to supply actors. Each element may be **(1)** a Foundry **Actor document** (or `{ id: actorId, name? }`), or **(2)** a token-centric object `{ tokenId, actorId, name?, group?, situationalBonus?, customModifier? }`. **Form (2) must use a `tokenId` key** — the token branch is selected by `if (a.tokenId != null && a.actorId != null)`. An object shaped `{ id: tokenId, actorId }` does **not** match: it falls back to matching *every* placeable for that actor, so an actor with two tokens on the scene silently produces **two roll rows instead of the one you named**. (Earlier versions of this table said `{ id: tokenId, ... }`; the worked example below was always correct.) **Per-actor modifiers:** when you pass an array of actor objects, each may include `situationalBonus` (number), `customModifier` (string), and `rollAdvantage` (string) for that actor only. If omitted for an actor, the global `options.situationalBonus`, `options.customModifier`, and `options.rollAdvantage` are used. Use this when only some actors get a bonus (e.g. one of two players has +2 for harvest), or when two actors roll under different conditions (e.g. one has advantage and one does not). **Silent mode only** — in dialog mode `actors` is stored and never read, so it does not pre-fill anything. Use `initialFilter` to influence the dialog's actor list. |

**Returns**

- **Module API** (`game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog(options)`): When `silent` is not used: `Application` (the opened dialog). When `options.silent === true`: `Promise<{ message: ChatMessage, messageId: string }>`.
- **Drop-in API** (`BlacksmithAPI.openRequestRollDialog(options)`): `Promise<Application>` when not silent, or `Promise<{ message, messageId }>` when `options.silent === true`.

**Examples**

```javascript
// Open with no pre-fill (same as clicking the toolbar button)
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog();

// Pre-select Perception check
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    initialSkill: 'perception'
});

// Same using initialType / initialValue
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    initialType: 'skill',
    initialValue: 'perception'
});

// Pre-select Strength saving throw
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    initialType: 'save',
    initialValue: 'str'
});

// Open with custom title, default DC 15, party filter, and group roll checked
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    title: 'Spot the trap',
    initialType: 'skill',
    initialValue: 'perception',
    dc: 15,
    initialFilter: 'party',
    groupRoll: true
});

// Roll for harvest with +2 situational bonus (pre-filled in Roll Configuration window)
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    title: 'Forage for Components',
    initialType: 'skill',
    initialValue: 'survival',
    dc: 12,
    situationalBonus: 2,
    customModifier: '+2'  // optional; e.g. tool or circumstance
});

// Two actors: only one gets a situational bonus (e.g. only Alice has the tool)
const api = game.modules.get('coffee-pub-blacksmith')?.api;
await api?.openRequestRollDialog({
    silent: true,
    title: 'Forage for Components',
    initialType: 'skill',
    initialValue: 'survival',
    dc: 12,
    actors: [
        { actorId: aliceActor.id, tokenId: aliceToken.id, name: 'Alice', situationalBonus: 2, customModifier: '+2' },
        { actorId: bobActor.id, tokenId: bobToken.id, name: 'Bob' }
    ]
});

// Via BlacksmithAPI (async)
const dialog = await BlacksmithAPI.openRequestRollDialog({
    title: 'Stealth check',
    initialSkill: 'stealth',
    dc: 12,
    initialFilter: 'selected'
});
```

### Contested requests

A contested request is one where the **actors carry two groups**: `group: 1` challenges,
`group: 2` defends. That is what makes a contest, not an option — a caller naming a
defender roll while handing over one group has described a roll with nobody to make it,
and gets an ordinary request.

```javascript
api.openRequestRollDialog({
    silent: true,
    initialType: 'skill',
    initialValue: 'ste',          // the challengers roll Stealth
    defenderType: 'skill',
    defenderValue: 'prc',         // the defenders roll Perception
    actors: [
        { tokenId: 'abc', actorId: '111', group: 1 },
        { tokenId: 'def', actorId: '222', group: 2 }
    ]
});
```

Omit `defenderValue` and both sides roll the challengers' roll, which is what the window
does when only one side has a roll chosen.

**A contest is decided by the highest roll on each side**, and the card reports
*Challengers Win* / *Defenders Win* / *Stalemate*. Two consequences follow:

- **`groupRoll` is ignored.** Group success counts how many rollers beat a DC, and a
  contest has no threshold to count against — the comparison *is* the outcome. Passing
  both would otherwise put two verdicts on one card.
- **A `dc` is a floor, not a target.** If both sides' highest rolls miss it, the result
  is a Stalemate rather than a winner.

### Silent mode: create roll request without opening the dialog

Pass `silent: true` to create the roll request and post it to chat immediately, without showing the Request a Roll window. You must supply a roll type (e.g. `initialType` + `initialValue`, or `initialSkill`). Actors are resolved from `initialFilter` ('party' or 'selected') or from an explicit `actors` array. The return value is a Promise that resolves to `{ message, messageId }`.

```javascript
// Module API (returns a Promise when silent)
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const { message, messageId } = await api.openRequestRollDialog({
    silent: true,
    title: 'Spot the trap',
    initialType: 'skill',
    initialValue: 'perception',
    dc: 15,
    initialFilter: 'party',
    groupRoll: true,
    onRollComplete: (payload) => console.log('Roll complete', payload)
});

// Drop-in API
const { message, messageId } = await BlacksmithAPI.openRequestRollDialog({
    silent: true,
    initialSkill: 'stealth',
    dc: 12,
    initialFilter: 'selected'
});
```

Silent mode supports the same options as the dialog (e.g. `dc`, `title`, `groupRoll`, `showDC`, `showRollExplanation`, `explanation`, `isCinematic`, `rollMode`, `rollAdvantage`, `lockRollAdvantage`, `onRollComplete`). It does not support contested rolls or tool proficiencies; use the full dialog for those.

### Requesting advantage or disadvantage

A module that computes the roll conditions under its own rules can state the resulting mode on the request
rather than describing it in the title. `rollAdvantage` takes `'advantage'`, `'disadvantage'`, or `'normal'`,
at the request level and per actor, and the per-actor value wins.

```javascript
// Treating an injury: the healer has a kit (advantage, DC -2); the patient treats themselves (disadvantage)
const api = game.modules.get('coffee-pub-blacksmith')?.api;
await api.openRequestRollDialog({
    silent: true,
    title: 'Treat Injury',
    initialType: 'skill',
    initialValue: 'medicine',
    dc: 13,
    rollAdvantage: 'normal',
    explanation: "A Healer's Kit grants Advantage and lowers the DC by 2. Treating your own injuries is done at Disadvantage.",
    actors: [
        { actorId: healer.id, tokenId: healerToken.id, name: 'Alice', rollAdvantage: 'advantage' },
        { actorId: patient.id, tokenId: patientToken.id, name: 'Bob', rollAdvantage: 'disadvantage' }
    ]
});
```

`'normal'` is a requestable value, not just the absence of one: it is how a requester says two effects
cancelled out, and it is the mode `lockRollAdvantage` enforces when a roll must be a straight `1d20`.

By default the requested mode is pre-selected and marked, and the roller can still choose another — the
request is guidance. Add `lockRollAdvantage: true` to render only the requested button in the Roll
Configuration window and the cinematic overlay, in which case a roll of any other mode is refused with a
warning notification.

```javascript
await api.openRequestRollDialog({
    silent: true,
    title: 'Poisoned',
    initialType: 'save',
    initialValue: 'con',
    dc: 12,
    initialFilter: 'party',
    rollAdvantage: 'disadvantage',
    lockRollAdvantage: true
});
```

The rolled formula reflects the mode the roller actually used: `2d20kh` for advantage, `2d20kl` for
disadvantage, `1d20` otherwise. The requested mode is carried on the request ChatMessage flags as
`rollAdvantage` and `lockRollAdvantage`, and per actor on each entry of `flags.actors`.

**Receiving roll results in your module (onRollComplete)**

Pass `onRollComplete` when opening the dialog to be notified each time a roll result is delivered to the chat card (when a player rolls). The callback is invoked with a single payload object:

```javascript
api.openRequestRollDialog({
    title: 'Spot the trap',
    initialType: 'skill',
    initialValue: 'perception',
    dc: 15,
    initialFilter: 'party',
    onRollComplete: (payload) => {
        // payload: { messageId, message, messageData, tokenId, result, allComplete, requesterId, rollerUserId }
        const { messageData, tokenId, result, allComplete } = payload;
        console.log('Roll received:', tokenId, result?.total);
        if (allComplete) {
            console.log('All rolls complete:', messageData.actors);
        }
    }
});
```

**Receiving roll results across clients (recommended for GM-authoritative workflows)**

Use the global hook below when the request may be initiated by players but your module resolves state on the GM:

```javascript
Hooks.on('blacksmith.requestRollComplete', (payload) => {
    // payload: { messageId, message, messageData, tokenId, result, allComplete, requesterId, rollerUserId }
    if (!game.user.isGM) return;

    const { messageId, tokenId, result, allComplete, messageData, requesterId, rollerUserId } = payload;
    console.log('Request roll update', { messageId, tokenId, total: result?.total, allComplete, requesterId, rollerUserId });

    if (allComplete) {
        // Run final GM-authoritative resolution here
    }
});
```

## Roll Type and Value Reference

You can pass either the system's CONFIG id (e.g. D&D 5e uses `prc` for Perception) or a friendly/localized name (e.g. `perception`); the dialog resolves it automatically.

### Skills (`initialType: 'skill'`)

Use skill ids or names as `initialValue`, for example:

- `perception` (or `prc` in D&D 5e), `stealth`, `insight`, `investigation`, `athletics`, `acrobatics`, `arcana`, `deception`, `history`, `intimidation`, `medicine`, `nature`, `performance`, `persuasion`, `religion`, `sleight_of_hand`, `survival`

### Abilities (`initialType: 'ability'`)

Use ability ids: `str`, `dex`, `con`, `int`, `wis`, `cha`.

### Saves (`initialType: 'save'`)

Use the same ability ids plus `death` for death saves: `str`, `dex`, `con`, `int`, `wis`, `cha`, `death`.

### Dice (`initialType: 'dice'`)

Pass a formula as `initialValue`. A dice roll is exactly its formula -- no ability modifier and no proficiency bonus are added:

- One die: `d6`, `1d20`, `d100`
- Several dice: `2d6`, `4d8`
- With a flat modifier: `2d6+10`, `1d20-2`

Terms may carry a label in brackets, which is Foundry's flavour syntax and reaches the roll's tooltip:

```javascript
initialValue: '2d10[Strength] + 1d4[Bludgeoning] + 10'
```

Anything Foundry's `Roll` can evaluate is rolled as given. The window's dice builder covers **any mix of the eight standard dice plus one flat modifier**, each with an optional label, so a value of that shape opens with the rows filled in — in the order the formula wrote them — and the steppers edit it. A formula outside that shape (roll data references such as `@abilities.str.mod`, subtracted dice, more than one flat term) is still rolled correctly, but the rows cannot show it, so the builder leaves it alone.

**`title` is the roll's name, not its formula.** It heads the chat card and the cinematic plate; the formula is carried separately and shown in its own right, beside the DC in both places. A dice request with no `title` is titled **"Custom Dice Roll"** rather than repeating its own formula.

```javascript
api.openRequestRollDialog({
    silent: true,
    initialType: 'dice',
    initialValue: '2d6[Fire] + 1d8[Radiant]',
    title: 'Sneak Attack',
    initialFilter: 'party'
});
```

Advantage and disadvantage apply only to a plain `1d20` — `_executeBuiltInRoll` matches that string exactly. A single unlabelled d20 composes to it; `2d20` and `1d20+3` do not, which is correct, since there is no advantage on those.

## Usage Examples

### Example: Party perception check, DC 12

A module that wants to ask for a **party perception check at DC 12** can open the dialog like this:

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (api?.openRequestRollDialog) {
    api.openRequestRollDialog({
        initialType: 'skill',
        initialValue: 'perception',
        initialFilter: 'party',
        dc: 12,
        groupRoll: true
    });
}
```

Optional: set a custom title (e.g. `title: 'Spot the ambush'`). The dialog opens with the Party filter active, all party actors pre-selected as challengers, Perception pre-selected as the roll type, DC 12, and the "Group roll" checkbox checked; the user only needs to click the request button (or change anything first).

### Example 1: Button that opens a Perception check

```javascript
// In your Application or HTML button handler
document.getElementById('btn-spot-trap').addEventListener('click', () => {
    const api = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!api?.openRequestRollDialog) return;
    api.openRequestRollDialog({
        title: 'Spot the trap',
        initialSkill: 'perception',
        dc: 15,
        initialFilter: 'party'
    });
});
```

### Example 2: Macro that opens Request a Roll with a pre-selected save

```javascript
// Foundry macro: open Request a Roll with Constitution save pre-selected
const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (api?.openRequestRollDialog) {
    api.openRequestRollDialog({
        initialType: 'save',
        initialValue: 'con',
        dc: 12
    });
} else {
    ui.notifications.warn('Blacksmith Request a Roll API not available.');
}
```

### Example 3: Using the drop-in API from another module

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

async function requestStealthCheck() {
    const dialog = await BlacksmithAPI.openRequestRollDialog({
        title: 'Stealth',
        initialSkill: 'stealth',
        dc: 10,
        initialFilter: 'selected'
    });
    // dialog is the SkillCheckDialog Application instance
    return dialog;
}
```

### Example 4: Hook that opens the dialog with context

```javascript
Hooks.on('my-module.requestRoll', (context) => {
    const api = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!api?.openRequestRollDialog) return;
    api.openRequestRollDialog({
        title: context.title || 'Request a Roll',
        initialType: context.type || 'skill',
        initialValue: context.value || 'perception',
        dc: context.dc,
        initialFilter: context.filter || 'party'
    });
});
```

## Related Documentation

- **`api-menubar.md`** – Menubar and toolbar registration (the "Request Roll" entry uses the same dialog)
- **`api-toolbar.md`** – Toolbar tool registration
- **`api-rolls.md`** – Roll outcome classification (crit/fumble/hit/miss/success) and subscription hooks
- **`architecture-rolls.md`** – Roll and skill check flow architecture

## Implementation Notes

- The Request Roll cinematic overlay and Request Roll-specific sounds are resolved from `theme-requestroll.json`.
- The old "skill-check backgrounds" terminology has been replaced in this feature theme with `cinematicBanners`.
- These theme assets are feature-local to Request Rolls and are not intended to be consumed by other modules through the general asset mapping system.
