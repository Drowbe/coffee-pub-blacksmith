# **🔄 API Migration Guide: From Old Constants to Asset Lookup Tool**

## **Overview**

This document outlines the migration from the old hardcoded constants system to the new **Asset Lookup Tool** that provides flexible, tag-based asset access while maintaining backward compatibility.

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
- **✅ COMPLETED**: ~80+ constants (all sounds, volumes, basic images)
- **❌ PENDING**: ~50+ constants (banners, tiles, backgrounds)
- **📈 PROGRESS**: ~60% complete

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

**Migration Status: 🟡 IN PROGRESS - Major sound system complete**
**Next Phase: 🟠 COMPLETE IMAGE MIGRATION - Add remaining banners, tiles, backgrounds**
**Future Phase: 🟢 FINAL TESTING - Verify all constants work correctly**
