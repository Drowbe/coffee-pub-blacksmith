# Plan: Expand Compendium Support to All Types

## Current State
- **Supported**: 4 special types with hardcoded settings
  - Actor (via `monsterCompendium` settings)
  - Item (via `itemCompendium` settings)
  - Spell (via `spellCompendium` settings)
  - Feature (via `featuresCompendium` settings)
- **Available but unsupported**: Other types found dynamically
  - JournalEntry, RollTable, Scene, Macro, Playlist, Adventure, Card, Stack

## Goal
Support ALL compendium types found in the system with:
- Dynamic setting registration
- Number of compendiums setting per type
- Priority-based compendium selection
- Selected arrays for all types

---

## Implementation Approach

### Option A: Fully Dynamic (Recommended)
- Automatically register settings for ALL types found in `getCompendiumChoices()`
- Use `arrCompendiumChoices${type}` arrays that are already created
- Generate setting names based on type (e.g., `journalEntryCompendium1`, `rollTableCompendium1`)

### Option B: Fixed List + Dynamic
- Maintain special handling for Actor/Item/Spell/Feature (backward compatibility)
- Dynamically add other types based on what's found in system

---

## Type Naming Convention

Need to convert Foundry types to setting-friendly names:

| Foundry Type | Setting Prefix | Array Name |
|--------------|----------------|------------|
| Actor | `monsterCompendium` | `arrSelectedMonsterCompendiums` (keep for backward compat) |
| Item | `itemCompendium` | `arrSelectedItemCompendiums` |
| Spell | `spellCompendium` | `arrSelectedSpellCompendiums` |
| Feature | `featuresCompendium` | `arrSelectedFeatureCompendiums` |
| JournalEntry | `journalEntryCompendium` | `arrSelectedJournalEntryCompendiums` |
| RollTable | `rollTableCompendium` | `arrSelectedRollTableCompendiums` |
| Scene | `sceneCompendium` | `arrSelectedSceneCompendiums` |
| Macro | `macroCompendium` | `arrSelectedMacroCompendiums` |
| Playlist | `playlistCompendium` | `arrSelectedPlaylistCompendiums` |
| Adventure | `adventureCompendium` | `arrSelectedAdventureCompendiums` |
| Card | `cardCompendium` | `arrSelectedCardCompendiums` |
| Stack | `stackCompendium` | `arrSelectedStackCompendiums` |

**Naming Rule**: Convert to camelCase, e.g., `JournalEntry` → `journalEntryCompendium`

---

## Implementation Plan

### Step 1: Create Type Mapping Helper Function

**Location**: `scripts/settings.js` (near `getCompendiumChoices()`)

```javascript
/**
 * Convert Foundry compendium type to setting-friendly prefix
 * @param {string} type - Foundry compendium type (e.g., "Actor", "JournalEntry")
 * @returns {string} Setting prefix (e.g., "monsterCompendium", "journalEntryCompendium")
 */
function getCompendiumSettingPrefix(type) {
    // Special cases for backward compatibility
    const specialCases = {
        'Actor': 'monsterCompendium',
        'Item': 'itemCompendium',
        'Spell': 'spellCompendium',  // Note: Spell isn't a Foundry type, it's content-based
        'Feature': 'featuresCompendium'  // Note: Feature isn't a Foundry type, it's content-based
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert Foundry type to camelCase setting prefix
    // "JournalEntry" → "journalEntry", "RollTable" → "rollTable"
    const firstChar = type.charAt(0).toLowerCase();
    const rest = type.slice(1);
    return `${firstChar}${rest}Compendium`;
}

/**
 * Convert Foundry compendium type to array name
 * @param {string} type - Foundry compendium type
 * @returns {string} Array name (e.g., "arrSelectedMonsterCompendiums")
 */
function getSelectedArrayName(type) {
    // Special cases
    const specialCases = {
        'Actor': 'arrSelectedMonsterCompendiums',
        'Item': 'arrSelectedItemCompendiums',
        'Spell': 'arrSelectedSpellCompendiums',
        'Feature': 'arrSelectedFeatureCompendiums'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert to array name: "JournalEntry" → "arrSelectedJournalEntryCompendiums"
    const firstChar = type.charAt(0);
    const rest = type.slice(1);
    return `arrSelected${firstChar}${rest}Compendiums`;
}

/**
 * Convert Foundry compendium type to numCompendiums setting name
 * @param {string} type - Foundry compendium type
 * @returns {string} Setting name (e.g., "numCompendiumsActor")
 */
function getNumCompendiumsSettingName(type) {
    // Special cases
    const specialCases = {
        'Actor': 'numCompendiumsActor',
        'Item': 'numCompendiumsItem',
        'Spell': 'numCompendiumsSpell',
        'Feature': 'numCompendiumsFeature'
    };
    
    if (specialCases[type]) {
        return specialCases[type];
    }
    
    // Convert: "JournalEntry" → "numCompendiumsJournalEntry"
    return `numCompendiums${type}`;
}
```

### Step 2: Dynamic Settings Registration

**Location**: `scripts/settings.js` (in `registerSettings()`, after compendium choices are built)

**Approach**: 
- After `getCompendiumChoices()` completes, get all types from `arrCompendiumChoicesData` or from existing `arrCompendiumChoices${type}` arrays
- For each type, register:
  1. `numCompendiums${type}` setting
  2. Loop to register `{prefix}Compendium1-N` settings

**Code Pattern**:
```javascript
// After getCompendiumChoices() is called, register settings for all types
// Get all types that have compendium choices available
const allTypes = [];
for (const key in BLACKSMITH) {
    if (key.startsWith('arrCompendiumChoices') && key !== 'arrCompendiumChoices' && key !== 'arrCompendiumChoicesData') {
        const type = key.replace('arrCompendiumChoices', '');
        allTypes.push(type);
    }
}

// Also include special types that use different naming
// Actor uses arrMonsterChoices, Item uses arrCompendiumChoicesItem
// Spell uses arrSpellChoices, Feature uses arrFeatureChoices
allTypes.push('Actor'); // Will map to arrMonsterChoices
allTypes.push('Item');  // Maps to arrCompendiumChoicesItem
allTypes.push('Spell'); // Maps to arrSpellChoices
allTypes.push('Feature'); // Maps to arrFeatureChoices

// Deduplicate and process each type
const uniqueTypes = [...new Set(allTypes)];
for (const type of uniqueTypes) {
    registerCompendiumTypeSettings(type);
}
```

Actually, better approach - get types from the actual compendium choices data:
```javascript
// Get unique types from compendium data
const compendiumData = BLACKSMITH.arrCompendiumChoicesData || [];
const allTypes = [...new Set(compendiumData.map(c => c.type))];

// Add special content-based types (Spell, Feature) that aren't direct Foundry types
allTypes.push('Spell');  // Content-based from Item compendiums
allTypes.push('Feature'); // Content-based from Item compendiums

// Register settings for each type
for (const type of allTypes) {
    registerCompendiumTypeSettings(type);
}
```

### Step 3: Create Reusable Registration Function

**Location**: `scripts/settings.js`

```javascript
/**
 * Register compendium settings for a specific type
 * @param {string} type - Foundry compendium type (e.g., "Actor", "JournalEntry")
 */
function registerCompendiumTypeSettings(type) {
    // Skip if already registered (for special types that are hardcoded)
    // We'll register special types separately for backward compatibility
    
    if (['Actor', 'Item', 'Spell', 'Feature'].includes(type)) {
        return; // Already registered individually
    }
    
    const settingPrefix = getCompendiumSettingPrefix(type);
    const numSetting = getNumCompendiumsSettingName(type);
    const choicesKey = type === 'Actor' ? 'arrMonsterChoices' 
                    : type === 'Item' ? 'arrCompendiumChoicesItem'
                    : type === 'Spell' ? 'arrSpellChoices'
                    : type === 'Feature' ? 'arrFeatureChoices'
                    : `arrCompendiumChoices${type}`;
    
    // Get human-readable label
    const getTypeLabel = (t) => {
        const typeMap = {
            'Actor': 'Actors',
            'Item': 'Items',
            'JournalEntry': 'Journal Entries',
            'RollTable': 'Roll Tables',
            'Scene': 'Scenes',
            'Macro': 'Macros',
            'Playlist': 'Playlists',
            'Adventure': 'Adventures',
            'Card': 'Cards',
            'Stack': 'Stacks',
            'Spell': 'Spells',
            'Feature': 'Features'
        };
        return typeMap[t] || t;
    };
    
    // Register header
    registerHeader(`${type}Compendiums`, 
        `headingH3${type}Compendiums-Label`, 
        `headingH3${type}Compendiums-Hint`, 
        'H3', 
        WORKFLOW_GROUPS.MANAGE_CONTENT);
    
    // Register number setting
    game.settings.register(MODULE.ID, numSetting, {
        name: MODULE.ID + '.numCompendiums-Label',
        hint: MODULE.ID + '.numCompendiums-Hint',
        type: Number,
        config: true,
        scope: 'world',
        default: 1,
        range: { min: 1, max: 20 },
        requiresReload: true,
        group: WORKFLOW_GROUPS.MANAGE_CONTENT
    });
    
    // Register compendium priority settings
    const numCompendiums = game.settings.get(MODULE.ID, numSetting) || 1;
    for (let i = 1; i <= numCompendiums; i++) {
        game.settings.register(MODULE.ID, `${settingPrefix}${i}`, {
            name: `${getTypeLabel(type)}: Priority ${i}`,
            hint: null,
            scope: "world",
            config: true,
            requiresReload: false,
            default: "none",
            choices: BLACKSMITH[choicesKey] || {"none": "-- None --"},
            group: WORKFLOW_GROUPS.MANAGE_CONTENT
        });
    }
}
```

### Step 4: Update buildSelectedCompendiumArrays()

**Location**: `scripts/settings.js`

Make it dynamic to handle all types:

```javascript
export function buildSelectedCompendiumArrays() {
    // Get all types from compendium data
    const compendiumData = BLACKSMITH.arrCompendiumChoicesData || [];
    const allTypes = [...new Set(compendiumData.map(c => c.type))];
    
    // Add special content-based types
    allTypes.push('Spell');
    allTypes.push('Feature');
    
    // Deduplicate
    const uniqueTypes = [...new Set(allTypes)];
    
    // Build arrays for each type
    for (const type of uniqueTypes) {
        const numSetting = getNumCompendiumsSettingName(type);
        const settingPrefix = getCompendiumSettingPrefix(type);
        const arrayName = getSelectedArrayName(type);
        
        // Check if setting exists (may not be registered yet on first load)
        if (!game.settings.settings.has(`${MODULE.ID}.${numSetting}`)) {
            continue; // Skip if settings not registered yet
        }
        
        const numCompendiums = game.settings.get(MODULE.ID, numSetting) || 1;
        const selected = [];
        
        for (let i = 1; i <= numCompendiums; i++) {
            const settingKey = `${settingPrefix}${i}`;
            if (!game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
                continue; // Skip if setting not registered
            }
            
            const compendiumId = game.settings.get(MODULE.ID, settingKey);
            if (compendiumId && compendiumId !== 'none' && compendiumId !== '') {
                selected.push(compendiumId);
            }
        }
        
        BLACKSMITH.updateValue(arrayName, selected);
    }
    
    postConsoleAndNotification(MODULE.NAME, "Selected compendium arrays updated", "", false, false);
}
```

### Step 5: Update settingChange Hook Pattern

**Location**: `scripts/blacksmith.js`

Update regex to match all type patterns:

```javascript
// Current: /^(numCompendiums|monsterCompendium|itemCompendium|spellCompendium|featuresCompendium)/
// New: Match any compendium setting
const compendiumSettingPattern = /^(numCompendiums|.+Compendium\d+)$/;
```

---

## Considerations

### Backward Compatibility
- Keep existing Actor/Item/Spell/Feature registration as-is (hardcoded)
- Or refactor to use the new dynamic system but maintain same setting names

### Spell & Feature Special Handling
- These aren't Foundry types, they're content-detected from Item compendiums
- Need special logic to handle them

### Setting Names
- Must be consistent and predictable
- Type names should convert cleanly to setting prefixes

### Performance
- Don't register settings for types that don't exist
- Only register for types found in the system

---

## Questions to Resolve

1. **Should we keep hardcoded Actor/Item/Spell/Feature or fully migrate to dynamic?**
   - Option: Keep them hardcoded for stability
   - Option: Migrate to dynamic system

2. **How to handle Spell/Feature?**
   - They're not Foundry types, they're content-detected
   - Keep special handling or integrate into dynamic system?

3. **Should we register ALL possible types, or only those found in the system?**
   - Option A: Only register for types that exist
   - Option B: Register for all known Foundry types (proactive)

4. **Naming convention for settings?**
   - Current: `monsterCompendium`, `itemCompendium`, `featuresCompendium`
   - New types: `journalEntryCompendium`, `rollTableCompendium`?
   - Consistent camelCase?

---

## Recommended Approach

1. **Keep special types hardcoded** (Actor/Item/Spell/Feature) for backward compatibility
2. **Add dynamic registration for other types** found in the system
3. **Update buildSelectedCompendiumArrays()** to handle all types dynamically
4. **Use consistent naming**: camelCase for setting prefixes

