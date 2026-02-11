# Request a Roll API Documentation

**Audience:** Developers integrating with Blacksmith and leveraging the exposed API.

## Overview

The Request a Roll API lets external modules open Blacksmith’s **Request a Roll** (Skill Check) dialog programmatically and optionally pre-fill its state. The dialog is the same one opened by the “Request a Roll” toolbar tool and menubar entry: it lets the GM choose a roll type (skill, ability, save, or tool), select actors (challengers/defenders), set a DC, and send a roll request to chat.

Use this API when your module needs to:
- Open the Request a Roll dialog from a button, macro, or hook
- Pre-select a roll type (e.g. Perception, Stealth, Strength save)
- Set a default DC or actor filter (selected tokens vs party)
- Override the dialog title for context (e.g. “Spot the trap”)

## Getting Started

### Accessing the API

```javascript
// Via game.modules (no imports – use in browser console or other modules)
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const dialog = api?.openRequestRollDialog({ initialSkill: 'perception' });

// Or via Blacksmith API bridge (async – waits for API ready)
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
| `options.title` | `string` | Override the dialog window title (e.g. `"Spot the trap"`). |
| `options.initialType` | `string` | Pre-select the roll type: `'skill'`, `'ability'`, or `'save'`. |
| `options.initialValue` | `string` | Id for that type. Examples: skills `'perception'`, `'stealth'`, `'insight'`; abilities `'str'`, `'dex'`, `'con'`, `'int'`, `'wis'`, `'cha'`; saves same as abilities plus `'death'`. |
| `options.initialSkill` | `string` | **Legacy.** Same as `initialType: 'skill'` with `initialValue` set to this (e.g. `'perception'`). |
| `options.dc` | `number` or `string` | Default DC value shown in the dialog’s DC field. |
| `options.initialFilter` | `string` | Which actor list is active: `'selected'` (only selected tokens) or `'party'` (party filter). |
| `options.callback` | `Function` | Callback used by the dialog (if applicable). |
| `options.onRollComplete` | `Function` | Callback when the roll completes (if applicable). |
| `options.actors` | `Array` | Optional actor list (if the dialog supports it). |

**Returns**

- **Module API** (`game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog(options)`): `Application` – The opened Skill Check dialog instance (synchronous).
- **Drop-in API** (`BlacksmithAPI.openRequestRollDialog(options)`): `Promise<Application>` – Resolves with the opened dialog after the API is ready.

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

// Open with custom title, default DC 15, and party filter
game.modules.get('coffee-pub-blacksmith').api.openRequestRollDialog({
    title: 'Spot the trap',
    initialType: 'skill',
    initialValue: 'perception',
    dc: 15,
    initialFilter: 'party'
});

// Via BlacksmithAPI (async)
const dialog = await BlacksmithAPI.openRequestRollDialog({
    title: 'Stealth check',
    initialSkill: 'stealth',
    dc: 12,
    initialFilter: 'selected'
});
```

## Roll Type and Value Reference

### Skills (`initialType: 'skill'`)

Use D&D 5e skill ids as `initialValue`, for example:

- `acrobatics`, `animal_handling`, `arcana`, `athletics`
- `deception`, `history`, `insight`, `intimidation`, `investigation`
- `medicine`, `nature`, `perception`, `performance`, `persuasion`
- `religion`, `sleight_of_hand`, `stealth`, `survival`

### Abilities (`initialType: 'ability'`)

Use ability ids: `str`, `dex`, `con`, `int`, `wis`, `cha`.

### Saves (`initialType: 'save'`)

Use the same ability ids plus `death` for death saves: `str`, `dex`, `con`, `int`, `wis`, `cha`, `death`.

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
        dc: 12
    });
}
```

Optional: set a custom title (e.g. `title: 'Spot the ambush'`). The dialog opens with Perception selected, party filter active, and DC 12; the user can still change anything before submitting.

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

- **`api-menubar.md`** – Menubar and toolbar registration (the “Request Roll” entry uses the same dialog)
- **`api-toolbar.md`** – Toolbar tool registration
- **`architecture-rolls.md`** – Roll and skill check flow architecture
