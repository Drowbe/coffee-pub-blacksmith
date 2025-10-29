# Plan: Honor Per-Type Compendium Settings

## Overview
Replace all hardcoded references to 8 compendiums with dynamic values that read from the per-type settings:
- `numCompendiumsActor` (for monsterCompendium settings)
- `numCompendiumsItem` (for itemCompendium settings)
- `numCompendiumsSpell` (for spellCompendium settings)
- `numCompendiumsFeature` (for featuresCompendium settings)

## Settings Mapping Reference
```javascript
const SETTING_MAP = {
    'actor': { 
        compendiumPrefix: 'monsterCompendium', 
        numSetting: 'numCompendiumsActor',
        default: 1
    },
    'item': { 
        compendiumPrefix: 'itemCompendium', 
        numSetting: 'numCompendiumsItem',
        default: 1
    },
    'spell': { 
        compendiumPrefix: 'spellCompendium', 
        numSetting: 'numCompendiumsSpell',
        default: 1
    },
    'feature': { 
        compendiumPrefix: 'featuresCompendium', 
        numSetting: 'numCompendiumsFeature',
        default: 1
    }
};
```

## Implementation Plan

### PHASE 1: Common.js (3 locations)

#### Location 1: `buildCompendiumLinkActor()` - First loop (~line 406)
**Current:**
```javascript
// Check up to 8 compendium settings in order
for (let i = 1; i <= 8; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
```

**Change to:**
```javascript
// Check compendium settings in order (up to configured number)
const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsActor') || 1;
for (let i = 1; i <= numCompendiums; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
```

#### Location 2: `buildCompendiumLinkActor()` - Second loop (~line 479)
**Current:**
```javascript
// Check up to 8 compendium settings in order
let found = false;
for (let i = 1; i <= 8; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
```

**Change to:**
```javascript
// Check compendium settings in order (up to configured number)
const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsActor') || 1;
let found = false;
for (let i = 1; i <= numCompendiums; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `monsterCompendium${i}`);
```

#### Location 3: `buildCompendiumLinkItem()` - Line ~531
**Current:**
```javascript
// Check up to 8 compendium settings in order
for (let i = 1; i <= 8; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `itemCompendium${i}`);
```

**Change to:**
```javascript
// Check compendium settings in order (up to configured number)
const numCompendiums = game.settings.get(MODULE.ID, 'numCompendiumsItem') || 1;
for (let i = 1; i <= numCompendiums; i++) {
    const compendiumSetting = game.settings.get(MODULE.ID, `itemCompendium${i}`);
```

---

### PHASE 2: manager-compendiums.js (2 locations)

#### Location 1: `getCompendiumSettings()` - Line 54
**Current:**
```javascript
// Get compendium mappings (1-8 for each type)
for (let i = 1; i <= 8; i++) {
    const settingKey = `${mappedType.compendium}Compendium${i}`;
```

**Change to:**
```javascript
// Get compendium mappings (up to configured number for each type)
// Map type to the numCompendiums setting name
const numSettingMap = {
    'item': 'numCompendiumsItem',
    'spell': 'numCompendiumsSpell',
    'feature': 'numCompendiumsFeature',
    'actor': 'numCompendiumsActor'
};
const numCompendiums = game.settings.get(MODULE.ID, numSettingMap[type]) || 1;

for (let i = 1; i <= numCompendiums; i++) {
    const settingKey = `${mappedType.compendium}Compendium${i}`;
```

#### Location 2: `getSearchOrder()` - Line 190
**Current:**
```javascript
// Add compendiums in order
for (let i = 1; i <= 8; i++) {
    const compendiumKey = `compendium${i}`;
```

**Change to:**
```javascript
// Add compendiums in order (up to configured number)
// Note: This function receives settings object from getCompendiumSettings()
// which already limits the number. However, we should still be safe and check
// We can count the actual compendium keys that exist in settings, or
// use a reasonable max (settings object already filtered by getCompendiumSettings)
const maxCompendiums = Object.keys(settings).filter(k => k.startsWith('compendium')).length;
for (let i = 1; i <= maxCompendiums; i++) {
    const compendiumKey = `compendium${i}`;
```

**Alternative approach** (simpler and more reliable):
Since `getCompendiumSettings()` already populates the settings object, we can just iterate over all `compendium${i}` keys that exist:

```javascript
// Add compendiums in order (settings object already filtered to configured number)
// Find the highest compendium number in settings
let maxNum = 0;
for (const key in settings) {
    if (key.startsWith('compendium')) {
        const num = parseInt(key.replace('compendium', ''));
        if (num > maxNum) maxNum = num;
    }
}
for (let i = 1; i <= maxNum; i++) {
    const compendiumKey = `compendium${i}`;
```

---

### PHASE 3: journal-tools.js (4 locations - array generation)

#### Helper Function to Generate Compendium Arrays
**Create at top of file or in a utility section:**
```javascript
/**
 * Generate array of compendium setting keys for a given type
 * @param {string} type - 'actor' or 'item'
 * @returns {string[]} Array of setting keys like ['monsterCompendium1', 'monsterCompendium2', ...]
 */
function getCompendiumSettingKeys(type) {
    const numCompendiums = type === 'actor' 
        ? (game.settings.get(MODULE.ID, 'numCompendiumsActor') || 1)
        : (game.settings.get(MODULE.ID, 'numCompendiumsItem') || 1);
    
    const prefix = type === 'actor' ? 'monsterCompendium' : 'itemCompendium';
    const keys = [];
    for (let i = 1; i <= numCompendiums; i++) {
        keys.push(`${prefix}${i}`);
    }
    return keys;
}
```

#### Location 1: Lines 1504-1507 (conditional array)
**Current:**
```javascript
const compendiumSettings = entityType === 'actor' 
    ? ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
       'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8']
    : ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
       'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
```

**Change to:**
```javascript
const compendiumSettings = getCompendiumSettingKeys(entityType);
```

#### Location 2: Lines 1592-1593 (actor compendiums array)
**Current:**
```javascript
const actorCompendiums = ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
                         'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8'];
```

**Change to:**
```javascript
const actorCompendiums = getCompendiumSettingKeys('actor');
```

#### Location 3: Lines 1620-1621 (item compendiums array)
**Current:**
```javascript
const itemCompendiums = ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
                        'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
```

**Change to:**
```javascript
const itemCompendiums = getCompendiumSettingKeys('item');
```

#### Location 4: Lines 2091-2092 (actor compendiums array - duplicate)
**Current:**
```javascript
const actorCompendiums = ['monsterCompendium1', 'monsterCompendium2', 'monsterCompendium3', 'monsterCompendium4', 
                         'monsterCompendium5', 'monsterCompendium6', 'monsterCompendium7', 'monsterCompendium8'];
```

**Change to:**
```javascript
const actorCompendiums = getCompendiumSettingKeys('actor');
```

#### Location 5: Lines 2119-2120 (item compendiums array - duplicate)
**Current:**
```javascript
const itemCompendiums = ['itemCompendium1', 'itemCompendium2', 'itemCompendium3', 'itemCompendium4',
                        'itemCompendium5', 'itemCompendium6', 'itemCompendium7', 'itemCompendium8'];
```

**Change to:**
```javascript
const itemCompendiums = getCompendiumSettingKeys('item');
```

---

## Edge Cases & Safety

### 1. Setting May Not Exist
- Use `|| 1` fallback (default to 1 compendium if setting doesn't exist)
- This handles:
  - First-time module load before settings are registered
  - Settings migration scenarios
  - User hasn't configured the setting yet

### 2. Invalid Setting Values
- Settings are Number type with range 1-20, so invalid values should be rare
- Fallback of `|| 1` handles `null`, `undefined`, `0`, or `NaN`

### 3. Performance Considerations
- Reading settings multiple times: Consider caching if called frequently
- Array generation: The helper function is efficient (O(n) where n = numCompendiums)
- Loop iterations: Still efficient even if user sets to max (20)

### 4. Backwards Compatibility
- Old settings that were set to "none" will be skipped (existing logic handles this)
- No need to migrate existing compendium settings
- Default of 1 matches the new setting defaults

---

## Testing Checklist

After implementation, test:

- [ ] Setting `numCompendiumsActor = 1` → Only checks `monsterCompendium1`
- [ ] Setting `numCompendiumsActor = 5` → Checks `monsterCompendium1-5`
- [ ] Setting `numCompendiumsItem = 3` → Only checks `itemCompendium1-3`
- [ ] Setting `numCompendiumsSpell = 10` → Checks `spellCompendium1-10` (via manager-compendiums)
- [ ] Setting `numCompendiumsFeature = 15` → Checks `featuresCompendium1-15` (via manager-compendiums)
- [ ] Setting value = 1 → Searches work correctly
- [ ] Setting value = 20 → Searches work correctly
- [ ] Compendiums set to "none" are still skipped correctly
- [ ] World search first/last settings still work correctly
- [ ] Journal tools linking works with dynamic arrays
- [ ] Common.js linking functions work with dynamic loops
- [ ] Manager-compendiums search functions work correctly

---

## Implementation Order

1. **Common.js** (3 changes) - Simplest, isolated functions
2. **manager-compendiums.js** (2 changes) - More complex but well-structured
3. **journal-tools.js** (1 helper + 5 replacements) - Most changes but straightforward pattern

---

## Notes

- All changes maintain backward compatibility
- No database migrations needed
- Settings are read at runtime, so changes take effect after reload (as expected)
- The helper function in journal-tools.js makes the code cleaner and easier to maintain

