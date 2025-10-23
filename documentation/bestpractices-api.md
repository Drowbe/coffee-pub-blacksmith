# **🔄 API Migration Guide: From Old Constants to Asset Lookup Tool**

## **Overview**

This document outlines the migration from the old hardcoded constants system to the new **Asset Lookup Tool** that provides flexible, tag-based asset access while maintaining backward compatibility.

## **🚨 CRITICAL INTEGRATION WARNINGS**

**⚠️ BEFORE YOU START INTEGRATING - READ THIS SECTION!**

These are the most common pitfalls external modules hit when integrating:
- **Undefined constants** (404 errors)
- **Background images not loading**
- **Sound dropdowns with duplicates**
- **Settings not working properly**

**The solutions are documented below, but the key points are:**
1. **NEVER import COFFEEPUB** from api-core.js - it will break the new system
2. **Follow the established naming conventions** for constants
3. **Avoid duplicate entries** in data collections
4. **Handle timing issues** with constants generation
5. **Always include "None Selected" options** in dropdowns

**Skip to the "Migration Issues We Encountered" section below for detailed solutions.**

## **📋 Quick Integration Checklist**

### **✅ What to DO:**
- [ ] Use `COFFEEPUB.X` directly (no imports needed)
- [ ] Follow established naming conventions (SOUNDEFFECTGENERAL05, not SOUNDCHARM)
- [ ] Include "None Selected" options in all dropdowns
- [ ] Use fallback paths for critical assets
- [ ] Test constants availability before using them

### **❌ What NOT to DO:**
- [ ] Import COFFEEPUB from api-core.js
- [ ] Create duplicate constants for the same files
- [ ] Use non-standard naming conventions
- [ ] Assume constants are available during initialization
- [ ] Skip testing after migration

## **🚨 What Changed (For Integrators)**

### **Old System (api-core.js)**
- **Hardcoded constants** scattered throughout the file
- **Timing issues** - constants might not be available when needed
- **Difficult maintenance** - adding new assets required manual updates
- **No organization** - constants were just a flat list

### **New System (Asset Lookup Tool + COFFEEPUB)**
- **Data-driven constants** generated from organized collections
- **Smart tagging** - assets organized by type, category, and tags
- **Flexible access** - find assets by criteria, not just hardcoded names
- **Auto-generation** - constants created automatically from data collections
- **Backward compatibility** - existing code continues to work

### **Data Structure Updates (For Integration)**
- **Added `value` field** - separates asset data from identifiers
- **Updated theme structure** - `id` now uses semantic names (e.g., "theme-default"), `value` contains CSS classes (e.g., "cardsdark")
- **Updated background image structure** - `id` now uses semantic names (e.g., "background-brick"), `value` contains CSS classes (e.g., "brick")
- **Updated icon structure** - `id` now uses semantic names (e.g., "icon-chess-queen"), `value` contains Font Awesome class names (e.g., "fa-chess-queen")
- **Volume constants** - now properly use `value` field for numeric levels (e.g., "0.5"), `path` field is empty
- **Improved separation** - `id` for internal references, `value` for asset data, `path` for file paths

## **✅ What's Available to External Modules**

### **Global Constants (Backward Compatible)**
```javascript
// These still work exactly as before
SOUNDERROR01                    // Direct access
COFFEEPUB.SOUNDERROR01         // Via COFFEEPUB object
```

### **Asset Lookup Tool (Recommended for Dynamic Use)**
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

## **🔧 Integration Steps**

### **Step 1: Do NOT Import COFFEEPUB (Rule of Thumb)**

**What to do:**
- Do not import `COFFEEPUB` from anywhere. Use `window.COFFEEPUB` or `COFFEEPUB` directly.

**Why:**
- Imports can override globals and break initialization timing.
- The constants are exposed globally once Blacksmith is ready.

### **Step 2: Use Global Constants (Simple Path)

**Preferred usage:**
```javascript
// This continues to work
playSound(COFFEEPUB.SOUNDNOTIFICATION01, COFFEEPUB.SOUNDVOLUMENORMAL);
```

**Alternative:**
```javascript
// More direct access
playSound(SOUNDNOTIFICATION01, SOUNDVOLUMENORMAL);
```

**Or use the Asset Lookup Tool (Dynamic Path):**
```javascript
// Get random error sound
const randomErrorSound = assetLookup.getRandom('sound', 'interface', ['error']);
playSound(randomErrorSound.path, randomErrorSound.volume);
```

### **Step 3: Add New Assets (FUTURE)**

**Old way (manual):**
```javascript
// Add to api-core.js
export const SOUNDNEWSOUND = "modules/coffee-pub-blacksmith/sounds/new-sound.mp3";
```

**New way (automatic):**
```javascript
// Add to assets.js
{
    "name": "New Sound",
    "id": "sound-new-sound",
    "value": "", // For sounds, usually empty (file path is in path)
    "constantname": "SOUNDNEWSOUND",
    "path": "modules/coffee-pub-blacksmith/sounds/new-sound.mp3",
    "tags": ["interface", "notification"],
    "type": "sound",
    "category": "interface"
}

// Example for volume setting:
{
    "name": "Medium",
    "id": "volume-medium",
    "value": "0.6", // Volume level used by playSound function
    "constantname": "SOUNDVOLUMEMEDIUM",
    "path": "", // Empty for volume settings
    "tags": ["volume", "medium"],
    "type": "volume",
    "category": "setting"
}
```

## **📋 Integration Checklist**

### **For Existing Code:**
- [x] **Remove old COFFEEPUB imports** (COMPLETED in Blacksmith itself)
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

### **Understanding the New Data Structure:**
```javascript
// Theme example - note the separation of concerns:
{
    "name": "Dark And Stormy",           // Display name in UI
    "id": "theme-dark",                  // Internal identifier for settings
    "value": "cardsdark",                // CSS class used for styling
    "constantname": "THEMEDARK",         // Generated constant
    "path": "",                          // Empty (no file path needed)
    "type": "theme",
    "category": "theme"
}

// Sound example:
{
    "name": "Interface: Error 01",      // Display name in UI
    "id": "sound-interface-error-01",   // Internal identifier
    "value": "",                         // Empty (no specific value needed)
    "constantname": "SOUNDERROR01",      // Generated constant
    "path": "modules/.../error-01.mp3", // File path for playback
    "type": "sound",
    "category": "interface"
}

// Icon example:
{
    "name": "Chess: Queen",             // Display name in UI
    "id": "icon-chess-queen",           // Internal identifier for settings
    "value": "fa-chess-queen",          // Font Awesome class name used for styling
    "constantname": "ICONCHESSQUEEN",    // Generated constant
    "path": "",                          // Empty (no file path needed)
    "type": "icon",
    "category": "interface"
}
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

## **🚨 Common Integration Issues & Solutions**

### **Issue: Constants are undefined**
**Solution:** Ensure Blacksmith is loaded and use globals (no imports needed)
```javascript
// Use global constants exposed by Blacksmith
console.log('SOUNDERROR01:', SOUNDERROR01);
console.log('COFFEEPUB.SOUNDERROR01:', COFFEEPUB.SOUNDERROR01);
```

### **Issue: 404 errors on sound playback**
**Solution:** Check that constants are properly generated
```javascript
console.log('SOUNDERROR01:', SOUNDERROR01);
```

### **Issue: Asset Lookup Tool not working**
**Solution:** Verify Blacksmith is ready and use the provided console test
```javascript
BlacksmithAPIAssetLookup();
```

## **⚠️ CRITICAL: Migration Issues We Encountered & How to Avoid Them**

### **Issue 1: Import Conflicts Causing Undefined Constants**
**What Happened:** Multiple files were importing `COFFEEPUB` from `api-core.js`, which was overriding the new system's constants.

**Symptoms:**
- `COFFEEPUB.SOUNDNOTIFICATION01` returns `undefined`
- Console shows `GET http://localhost:30000/undefined 404 (Not Found)`
- Background images fail to load in cinematic skill checks

**Root Cause:** Old import statements were preventing the new constants from being exposed globally.

**How to Avoid:**
```javascript
// ❌ DON'T DO THIS - This will break the new system
import { COFFEEPUB } from './api-core.js';

// ✅ DO THIS INSTEAD - Use the global constants directly
// COFFEEPUB is automatically available via window.COFFEEPUB
const sound = COFFEEPUB.SOUNDNOTIFICATION01;
```

**Files That Need Updating (in your module):**
- Remove `import { COFFEEPUB } from './api-core.js';` (do not import COFFEEPUB)
- Use `COFFEEPUB.X` or `window.COFFEEPUB?.X` directly

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
- **Volumes**: `SOUNDVOLUME + LEVEL` (e.g., `SOUNDVOLUMENORMAL`, `SOUNDVOLUMELOUD`)

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

// Or wait for Blacksmith to be ready
Hooks.once('ready', () => {
    const backgroundImage = COFFEEPUB.BACKSKILLCHECK;
});
```



## **🎯 Next Steps**

### **Immediate (This Session):**
- [x] **Fix sound playback** (COMPLETED)
- [x] **Verify constants work** (COMPLETED)
- [ ] **Test all major features** to ensure no regressions

### **Short Term (Next Few Sessions):**
- [ ] **Comment out old constants** in `api-core.js`
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

## **📞 Support and Validation**

If integration doesn’t work as expected:
- Run `BlacksmithAPIStatus()` and `BlacksmithAPICheck()` in the console
- Verify `COFFEEPUB` and `BlacksmithConstants` exist
- Use `BlacksmithAPIAssetLookup()` to validate the Asset Lookup Tool
- Check browser console for any module load order errors
