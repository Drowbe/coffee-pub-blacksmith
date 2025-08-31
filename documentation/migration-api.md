# **🔄 API Migration Guide: From Old Constants to Asset Lookup Tool**

## **Overview**

This document outlines the migration from the old hardcoded constants system to the new **Asset Lookup Tool** that provides flexible, tag-based asset access while maintaining backward compatibility.

## **🚨 CRITICAL MIGRATION WARNINGS**

**⚠️ BEFORE YOU START MIGRATING - READ THIS SECTION!**

We encountered several critical issues during our migration that caused:
- **Undefined constants** (404 errors)
- **Background images not loading**
- **Sound dropdowns with duplicates**
- **Settings not working properly**

**The solutions are documented below, but the key points are:**
1. **NEVER import COFFEEPUB** from api-common.js - it will break the new system
2. **Follow the established naming conventions** for constants
3. **Avoid duplicate entries** in data collections
4. **Handle timing issues** with constants generation
5. **Always include "None Selected" options** in dropdowns

**Skip to the "Migration Issues We Encountered" section below for detailed solutions.**

## **📋 Quick Migration Checklist**

### **✅ What to DO:**
- [ ] Use `COFFEEPUB.X` directly (no imports needed)
- [ ] Follow established naming conventions (SOUNDEFFECTGENERAL05, not SOUNDCHARM)
- [ ] Include "None Selected" options in all dropdowns
- [ ] Use fallback paths for critical assets
- [ ] Test constants availability before using them

### **❌ What NOT to DO:**
- [ ] Import COFFEEPUB from api-common.js
- [ ] Create duplicate constants for the same files
- [ ] Use non-standard naming conventions
- [ ] Assume constants are available during initialization
- [ ] Skip testing after migration

## **🚨 What Changed**

### **Old System (api-common.js)**
- **Hardcoded constants** scattered throughout the file
- **Timing issues** - constants might not be available when needed
- **Difficult maintenance** - adding new assets required manual updates
- **No organization** - constants were just a flat list

### **New System (Asset Lookup Tool)**
- **Data-driven constants** generated from organized collections
- **Smart tagging** - assets organized by type, category, and tags
- **Flexible access** - find assets by criteria, not just hardcoded names
- **Auto-generation** - constants created automatically from data collections
- **Backward compatibility** - existing code continues to work

## **✅ What's Already Working**

### **Global Constants (Backward Compatible)**
```javascript
// These still work exactly as before
SOUNDERROR01                    // Direct access
COFFEEPUB.SOUNDERROR01         // Via COFFEEPUB object
```

### **Asset Lookup Tool (New Features)**
```javascript
// Get assets by type and tags
const errorSounds = assetLookup.getByTypeAndTags('sound', 'interface', ['error']);

// Get assets by category
const interfaceAssets = assetLookup.getByCategory('interface');

// Search by criteria
const fireAssets = assetLookup.searchByCriteria({
    tags: ['fire', 'damage'],
    type: 'image'
});
```

## **🔧 Migration Steps**

### **Step 1: Remove Old Imports (COMPLETED)**

**What was done:**
- Removed `import { COFFEEPUB } from './api-common.js';` from `blacksmith.js`
- New system now provides `COFFEEPUB` globally via `AssetLookup`

**Why this was needed:**
- Old import was overriding the new constants
- Caused timing issues where constants were undefined
- Prevented new system from working properly

### **Step 2: Update Code to Use New Constants (OPTIONAL)**

**Current code still works:**
```javascript
// This continues to work
playSound(COFFEEPUB.SOUNDNOTIFICATION01, COFFEEPUB.SOUNDVOLUMENORMAL);
```

**Can be updated to:**
```javascript
// More direct access
playSound(SOUNDNOTIFICATION01, SOUNDVOLUMENORMAL);
```

**Or use the Asset Lookup Tool:**
```javascript
// Get random error sound
const randomErrorSound = assetLookup.getRandom('sound', 'interface', ['error']);
playSound(randomErrorSound.path, randomErrorSound.volume);
```

### **Step 3: Add New Assets (FUTURE)**

**Old way (manual):**
```javascript
// Add to api-common.js
export const SOUNDNEWSOUND = "modules/coffee-pub-blacksmith/sounds/new-sound.mp3";
```

**New way (automatic):**
```javascript
// Add to data-collections.js
{
    "name": "New Sound",
    "id": "modules/coffee-pub-blacksmith/sounds/new-sound.mp3",
    "constantname": "SOUNDNEWSOUND",
    "path": "modules/coffee-pub-blacksmith/sounds/new-sound.mp3",
    "tags": ["interface", "notification"],
    "type": "sound",
    "category": "interface"
}
```

## **📋 Migration Checklist**

### **For Existing Code:**
- [x] **Remove old COFFEEPUB imports** (COMPLETED)
- [ ] **Test all sound playback** - verify no 404 errors
- [ ] **Test all constant access** - verify constants are defined
- [ ] **Test Asset Lookup Tool** - verify new features work

### **For New Development:**
- [ ] **Use Asset Lookup Tool** for dynamic asset selection
- [ ] **Add new assets** to data collections, not hardcoded constants
- [ ] **Use tag-based lookups** for flexible asset access
- [ ] **Generate constants automatically** from data collections

## **🔍 Testing the Migration**

### **Console Commands to Test:**
```javascript
// Test if constants are available
console.log('SOUNDERROR01:', SOUNDERROR01);
console.log('COFFEEPUB.SOUNDERROR01:', COFFEEPUB.SOUNDERROR01);

// Test Asset Lookup Tool
BlacksmithAPIAssetLookup();

// Test constants generation
BlacksmithAPIGenerateConstants();
```

### **What to Look For:**
- ✅ **Constants return file paths** instead of `undefined`
- ✅ **No 404 errors** when playing sounds
- ✅ **Asset Lookup Tool** returns organized results
- ✅ **Constants generation** creates 85+ constants

## **💡 Best Practices Going Forward**

### **For UI Dropdowns:**
```javascript
// Get choices for settings
const soundChoices = assetLookup.getChoices('sound', 'interface');
// Returns: { "path": "Display Name", ... }
```

### **For Dynamic Selection:**
```javascript
// Get random monster banner
const banner = assetLookup.getRandom('image', 'banner', ['monster']);
// Returns: { name, path, tags, type, category }
```

### **For Search and Filtering:**
```javascript
// Find all fire-related assets
const fireAssets = assetLookup.searchByCriteria({
    tags: ['fire'],
    type: 'image'
});
```

## **🚨 Common Issues & Solutions**

### **Issue: Constants are undefined**
**Solution:** Ensure `AssetLookup` is imported and instantiated
```javascript
import { assetLookup } from './asset-lookup.js';
```

### **Issue: 404 errors on sound playback**
**Solution:** Check that constants are properly generated
```javascript
console.log('SOUNDERROR01:', SOUNDERROR01);
```

### **Issue: Asset Lookup Tool not working**
**Solution:** Verify data collections are properly structured
```javascript
BlacksmithAPIAssetLookup();
```

## **⚠️ CRITICAL: Migration Issues We Encountered & How to Avoid Them**

### **Issue 1: Import Conflicts Causing Undefined Constants**
**What Happened:** Multiple files were importing `COFFEEPUB` from `api-common.js`, which was overriding the new system's constants.

**Symptoms:**
- `COFFEEPUB.SOUNDNOTIFICATION01` returns `undefined`
- Console shows `GET http://localhost:30000/undefined 404 (Not Found)`
- Background images fail to load in cinematic skill checks

**Root Cause:** Old import statements were preventing the new constants from being exposed globally.

**How to Avoid:**
```javascript
// ❌ DON'T DO THIS - This will break the new system
import { COFFEEPUB } from './api-common.js';

// ✅ DO THIS INSTEAD - Use the global constants directly
// COFFEEPUB is automatically available via window.COFFEEPUB
const sound = COFFEEPUB.SOUNDNOTIFICATION01;
```

**Files That Need Updating:**
- Remove `import { COFFEEPUB } from './api-common.js';` from ALL files
- Update all `COFFEEPUB.X` references to `window.COFFEEPUB?.X` or just `COFFEEPUB.X`

### **Issue 2: Duplicate Constants in Data Collections**
**What Happened:** The data collection had duplicate entries with different constant names pointing to the same files.

**Symptoms:**
- Sound dropdowns show duplicate entries (e.g., "General: Charm" twice)
- Constants like `SOUNDCHARM` and `SOUNDEFFECTGENERAL05` both point to `charm.mp3`
- Dropdown menus default to first item instead of "None Selected"

**Root Cause:** Data collection contained both old and new constant names for the same assets.

**How to Avoid:**
```javascript
// ❌ DON'T DO THIS - Duplicate constants
{
    "constantname": "SOUNDCHARM",           // New name
    "path": "modules/coffee-pub-blacksmith/sounds/charm.mp3"
},
{
    "constantname": "SOUNDEFFECTGENERAL05", // Old name - SAME FILE!
    "path": "modules/coffee-pub-blacksmith/sounds/charm.mp3"
}

// ✅ DO THIS INSTEAD - One constant per file
{
    "constantname": "SOUNDEFFECTGENERAL05", // Keep the established naming convention
    "path": "modules/coffee-pub-blacksmith/sounds/charm.mp3"
}
```

**Naming Convention to Follow:**
- **Sounds**: `SOUNDEFFECT + CATEGORY + DOUBLE-DIGIT INDEX` (e.g., `SOUNDEFFECTGENERAL05`)
- **Images**: `BACK + DESCRIPTIVE_NAME` (e.g., `BACKSKILLCHECK`, `BACKABILITYCHECK`)
- **Themes**: `THEME + COLOR` (e.g., `THEMEDEFAULT`, `THEMEBLUE`)

### **Issue 3: Timing Issues with Constants Generation**
**What Happened:** Constants weren't available when modules tried to access them.

**Symptoms:**
- `COFFEEPUB.BACKSKILLCHECK` is `undefined` during skill check initialization
- Background images fail to load even though constants exist later

**Root Cause:** Constants generation happens asynchronously, but code was trying to access them synchronously.

**How to Avoid:**
```javascript
// ❌ DON'T DO THIS - Synchronous access during initialization
const backgroundImage = COFFEEPUB.BACKSKILLCHECK; // Might be undefined

// ✅ DO THIS INSTEAD - Use fallback or wait for constants
const backgroundImage = COFFEEPUB.BACKSKILLCHECK || 'modules/coffee-pub-blacksmith/images/banners/banners-damage-radiant-2.webp';

// Or use the Asset Lookup Tool's ready check
if (assetLookup.areConstantsReady()) {
    const backgroundImage = COFFEEPUB.BACKSKILLCHECK;
} else {
    // Use fallback or wait
    assetLookup.waitForConstants().then(() => {
        const backgroundImage = COFFEEPUB.BACKSKILLCHECK;
    });
}
```

### **Issue 4: Settings Dropdowns Not Showing "None Selected"**
**What Happened:** Dropdown menus defaulted to the first item instead of showing a "None Selected" option.

**Symptoms:**
- Sound settings default to first sound instead of "No Sound"
- Icon settings default to first icon instead of "No Icon"

**Root Cause:** Choice generation functions weren't explicitly adding "None Selected" options.

**How to Avoid:**
```javascript
// ❌ DON'T DO THIS - Missing "None Selected" option
function getSoundChoices() {
    const choices = {};
    dataSounds.sounds.forEach(sound => {
        choices[sound.id] = sound.name;
    });
    return choices;
}

// ✅ DO THIS INSTEAD - Explicitly add "None Selected"
function getSoundChoices() {
    const choices = {
        'none': '— None Selected —'  // Always first
    };
    
    // Add deduplicated sounds
    const uniqueSounds = new Set();
    dataSounds.sounds.forEach(sound => {
        if (!uniqueSounds.has(sound.id)) {
            uniqueSounds.add(sound.id);
            choices[sound.id] = sound.name;
        }
    });
    
    return choices;
}
```

## **🎯 Next Steps**

### **Immediate (This Session):**
- [x] **Fix sound playback** (COMPLETED)
- [x] **Verify constants work** (COMPLETED)
- [ ] **Test all major features** to ensure no regressions

### **Short Term (Next Few Sessions):**
- [ ] **Comment out old constants** in `api-common.js`
- [ ] **Verify new system handles everything**
- [ ] **Update any remaining hardcoded references**

### **Long Term (Future Development):**
- [ ] **Add more asset types** to data collections
- [ ] **Implement auto-scanning** for folder changes
- [ ] **Enhance Asset Lookup Tool** with more features

## **📚 Related Documentation**

- **`BLACKSMITH-API.md`** - External API documentation
- **`migration-constants.md`** - Constants system migration plan
- **`BLACKSMITH-ARCHITECTURE.md`** - Internal architecture details

---

## **📊 Migration Status Update**

### **Session Progress (Latest):**
- **✅ COMPLETED**: ~90+ constants (all sounds, volumes, basic images, skill check backgrounds)
- **✅ COMMENTED OUT**: ~100+ old constants in `api-common.js` (banners, tiles, backgrounds)
- **📈 PROGRESS**: ~85% complete

### **What Was Added This Session:**
- **Button Sounds**: 12 constants (SOUNDBUTTON01-12)
- **Pop Sounds**: 3 constants (SOUNDPOP01-03)
- **Effect Sounds**: Book, chest, weapon, instrument, reaction, general effects
- **Skill Check Sounds**: 8 constants (cinematic, dice, success, failure, etc.)
- **Volume Constants**: 4 constants (loud, normal, soft, max)
- **Basic Banner Images**: Started with hero banners

### **Next Priority:**
- **Complete banner images** (heroes, monsters, landscape, oops, damage types)
- **Add tile images** (ground, cloth, paper)
- **Add background images** (skill check, ability check, etc.)

---

**Migration Status: 🟡 IN PROGRESS - Sound system and skill check backgrounds complete**
**Next Phase: 🟠 ADD REMAINING IMAGE CONSTANTS - Add banners, tiles to data collections**
**Future Phase: 🟢 FINAL TESTING - Verify all constants work correctly**
