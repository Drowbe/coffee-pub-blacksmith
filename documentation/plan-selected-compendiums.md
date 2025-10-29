# Implementation Plan: Selected Compendium Arrays

## Overview
Create and maintain arrays that contain only the **configured/selected** compendiums in priority order for each type (Actor, Item, Spell, Feature). These arrays will be exposed to other modules via `BLACKSMITH.updateValue()` so external modules can iterate through configured compendiums without duplicating configuration logic.

## Goals
- **Single Source of Truth**: Blacksmith manages which compendiums are selected
- **Priority Order**: Array position = priority (index 0 = Priority 1, etc.)
- **Simple API**: Other modules just iterate the array
- **Automatic Updates**: Arrays rebuild when settings change

---

## Implementation Steps

### Step 1: Create Function to Build Selected Arrays

**Location**: `scripts/settings.js` (after `getCompendiumChoices()` function)

**Function Name**: `buildSelectedCompendiumArrays()`

**Functionality**:
1. Read `numCompendiums*` settings to know how many to check
2. For each compendium type (Actor, Item, Spell, Feature):
   - Loop through priority slots (1 to numCompendiums)
   - Read the compendium setting value
   - Only include non-"none", non-empty values
   - Add to array in priority order
3. Expose arrays via `BLACKSMITH.updateValue()`

**Array Names**:
- `arrSelectedMonsterCompendiums` (for Actor/Monster)
- `arrSelectedItemCompendiums` (for Item)
- `arrSelectedSpellCompendiums` (for Spell)
- `arrSelectedFeatureCompendiums` (for Feature)

**Array Format**:
- Simple string array of compendium IDs
- Example: `["dnd5e.monsters", "mycompendium.monsters", "pf2e.bestiary"]`
- Empty array `[]` if none configured
- Position in array = Priority (index 0 = Priority 1, etc.)

**Code Structure**:
```javascript
function buildSelectedCompendiumArrays() {
    // Actor/Monster compendiums
    const numActor = game.settings.get(MODULE.ID, 'numCompendiumsActor') || 1;
    const selectedMonsters = [];
    for (let i = 1; i <= numActor; i++) {
        const compendiumId = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
        if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
            selectedMonsters.push(compendiumId);
        }
    }
    BLACKSMITH.updateValue('arrSelectedMonsterCompendiums', selectedMonsters);
    
    // Item compendiums
    const numItem = game.settings.get(MODULE.ID, 'numCompendiumsItem') || 1;
    const selectedItems = [];
    for (let i = 1; i <= numItem; i++) {
        const compendiumId = game.settings.get(MODULE.ID, `itemCompendium${i}`);
        if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
            selectedItems.push(compendiumId);
        }
    }
    BLACKSMITH.updateValue('arrSelectedItemCompendiums', selectedItems);
    
    // Spell compendiums
    const numSpell = game.settings.get(MODULE.ID, 'numCompendiumsSpell') || 1;
    const selectedSpells = [];
    for (let i = 1; i <= numSpell; i++) {
        const compendiumId = game.settings.get(MODULE.ID, `spellCompendium${i}`);
        if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
            selectedSpells.push(compendiumId);
        }
    }
    BLACKSMITH.updateValue('arrSelectedSpellCompendiums', selectedSpells);
    
    // Feature compendiums
    const numFeature = game.settings.get(MODULE.ID, 'numCompendiumsFeature') || 1;
    const selectedFeatures = [];
    for (let i = 1; i <= numFeature; i++) {
        const compendiumId = game.settings.get(MODULE.ID, `featuresCompendium${i}`);
        if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
            selectedFeatures.push(compendiumId);
        }
    }
    BLACKSMITH.updateValue('arrSelectedFeatureCompendiums', selectedFeatures);
    
    postConsoleAndNotification(MODULE.NAME, "Selected compendium arrays updated", "", false, false);
}
```

---

### Step 2: Call Function at End of registerSettings()

**Location**: `scripts/settings.js` (at the very end of `registerSettings()` function, before closing brace)

**Action**:
- Call `buildSelectedCompendiumArrays()` after all settings are registered
- This builds the arrays on initial load

**Code**:
```javascript
} // END OF "export const registerSettings"

// After registerSettings, build selected compendium arrays
// This happens at the end of registerSettings() function:
buildSelectedCompendiumArrays();
```

**Note**: Since `registerSettings()` is async, we need to call this at the end of the function, but it needs to be synchronous (read settings, not async operations).

---

### Step 3: Hook into settingChange to Rebuild Arrays

**Location**: `scripts/blacksmith.js` (in the ready hook, near the existing `settingChange` hook)

**Action**:
- Extend the existing `settingChange` hook to also rebuild selected compendium arrays when compendium-related settings change

**Settings to Monitor**:
- `numCompendiumsActor`, `numCompendiumsItem`, `numCompendiumsSpell`, `numCompendiumsFeature`
- `monsterCompendium1-20`
- `itemCompendium1-20`
- `spellCompendium1-20`
- `featuresCompendium1-20`

**Code Pattern**:
```javascript
// In the existing settingChange hook in blacksmith.js
// Add condition to rebuild arrays:
const compendiumSettings = [
    'numCompendiumsActor', 'numCompendiumsItem', 'numCompendiumsSpell', 'numCompendiumsFeature',
    // Pattern match for compendium settings
    /^monsterCompendium\d+$/, 
    /^itemCompendium\d+$/, 
    /^spellCompendium\d+$/, 
    /^featuresCompendium\d+$/
];

if (moduleId === MODULE.ID && compendiumSettings.some(s => settingKey === s || (typeof s === 'object' && s.test(settingKey)))) {
    // Import and call buildSelectedCompendiumArrays
    // Need to import it from settings.js or make it accessible
}
```

**Alternative Approach** (Cleaner):
- Make `buildSelectedCompendiumArrays()` accessible outside settings.js
- Either export it or attach it to a manager class
- Import it in blacksmith.js and call from settingChange hook

---

### Step 4: Export Function for Hook Access

**Location**: `scripts/settings.js`

**Action**:
- Export `buildSelectedCompendiumArrays()` so it can be imported in blacksmith.js

**Code**:
```javascript
export function buildSelectedCompendiumArrays() {
    // ... function code ...
}
```

**Then in blacksmith.js**:
```javascript
import { buildSelectedCompendiumArrays } from './settings.js';

// In settingChange hook:
if (moduleId === MODULE.ID) {
    clearSettingsCache();
    
    // Rebuild selected compendium arrays if compendium settings changed
    const compendiumSettingPattern = /^(numCompendiums|monsterCompendium|itemCompendium|spellCompendium|featuresCompendium)/;
    if (compendiumSettingPattern.test(settingKey)) {
        buildSelectedCompendiumArrays();
    }
}
```

---

### Step 5: Initialize Arrays on First Load

**Location**: `scripts/blacksmith.js` (ready hook, after `registerSettings()`)

**Action**:
- After settings are registered, call `buildSelectedCompendiumArrays()` once
- This ensures arrays exist even if no settings change

**Code**:
```javascript
// In ready hook, after await registerSettings():
await registerSettings();
buildSelectedCompendiumArrays(); // Build arrays on initial load
```

---

## Array Naming Convention

**Pattern**: `arrSelected{Type}Compendiums`

- `arrSelectedMonsterCompendiums` - Actor/Monster compendiums
- `arrSelectedItemCompendiums` - Item compendiums  
- `arrSelectedSpellCompendiums` - Spell compendiums
- `arrSelectedFeatureCompendiums` - Feature compendiums

**Note**: "Monster" not "Actor" for consistency with existing `arrMonsterChoices`

---

## Example Usage by Other Modules

```javascript
// External module using selected compendiums
const selectedMonsters = BLACKSMITH.arrSelectedMonsterCompendiums || [];

for (const compendiumId of selectedMonsters) {
    // Search in compendium (already in priority order)
    // Position 0 = Priority 1, Position 1 = Priority 2, etc.
    const pack = game.packs.get(compendiumId);
    if (pack) {
        // Search logic here
    }
}
```

---

## Testing Checklist

- [ ] Arrays are built on initial load
- [ ] Arrays are empty array `[]` when no compendiums configured
- [ ] Arrays contain only non-"none" values
- [ ] Arrays respect priority order (1, 2, 3...)
- [ ] Arrays update when `numCompendiums*` setting changes
- [ ] Arrays update when individual compendium settings change
- [ ] Arrays are exposed via `BLACKSMITH.updateValue()`
- [ ] `blacksmithUpdated` hook fires when arrays update
- [ ] Arrays accessible via `BLACKSMITH.arrSelectedMonsterCompendiums` etc.
- [ ] Empty values are excluded correctly
- [ ] Works with min value (1 compendium)
- [ ] Works with max value (20 compendiums)
- [ ] Works with mixed "none" and configured values (e.g., Priority 1 configured, Priority 2 = "none", Priority 3 configured)

---

## Edge Cases

### No Compendiums Configured
- Arrays should be empty `[]`, not `undefined`
- Other modules should check for empty array: `if (selected.length > 0)`

### Setting Changed to "none"
- Arrays should rebuild and exclude that compendium
- Priority order maintained for remaining compendiums

### Setting Changed to Different Compendium
- Arrays should rebuild with new compendium in same priority position

### numCompendiums Decreased
- Arrays should rebuild with fewer entries
- Higher priority compendiums beyond new limit are excluded

### numCompendiums Increased
- Arrays should rebuild, checking new slots
- New slots may be "none", so arrays may not change if nothing configured

---

## File Changes Summary

1. **scripts/settings.js**:
   - Add `buildSelectedCompendiumArrays()` function
   - Export function
   - Call at end of `registerSettings()` (optional - handled in blacksmith.js)

2. **scripts/blacksmith.js**:
   - Import `buildSelectedCompendiumArrays` from settings.js
   - Call after `registerSettings()` in ready hook
   - Extend `settingChange` hook to rebuild arrays when compendium settings change

---

## Notes

- Function must be synchronous (reading settings, not async operations)
- Arrays are built in-memory, no database operations
- Performance: Fast operation, only runs when settings change
- Thread-safe: Settings reads are safe, arrays are rebuilt atomically via `updateValue()`

