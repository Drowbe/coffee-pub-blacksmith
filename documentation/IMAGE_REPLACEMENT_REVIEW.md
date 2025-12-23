# Token Image Replacement - Architecture Review & Extension Plan

## Current Architecture Overview

### Core Components

1. **ImageCacheManager** (`scripts/manager-image-cache.js`)
   - Manages cache structure: `files`, `folders`, `creatureTypes`
   - Single base path: `tokenImageReplacementPath` setting
   - Cache stored in: `game.settings.get(MODULE.ID, 'tokenImageReplacementCache')`
   - Cache version: `'1.4'` (in metadata)

2. **TokenImageReplacementWindow** (`scripts/token-image-replacement.js`)
   - UI for browsing/selecting replacement images
   - Uses `ImageCacheManager.cache` as source of truth
   - Filters by category, tags, search terms

3. **ImageMatching** (`scripts/manager-image-matching.js`)
   - Unified matching algorithm
   - Scores images based on token characteristics

### Current Limitations

1. **Single Folder Path**
   - Only one `tokenImageReplacementPath` setting
   - All images must be under one base directory
   - No way to combine multiple image sources

2. **Token-Only Support**
   - Only replaces `token.texture.src`
   - No portrait support for `actor.img`
   - Cache structure assumes token images only

3. **Cache Structure**
   - Single cache file per feature
   - No separation between token/portrait caches
   - Cache metadata includes `basePath` (singular)

---

## Extension Plan: Multiple Folders

### 1. Settings Changes

**Current:**
```javascript
game.settings.register(MODULE.ID, 'tokenImageReplacementPath', {
    type: String,
    default: '',
    // ...
});
```

**Proposed: Use Numbered Settings Pattern (Like Compendiums)**

Following the existing pattern used for compendium mappings (`itemCompendium1`, `itemCompendium2`, etc.):

```javascript
// Number of paths setting (controls how many path slots are available)
game.settings.register(MODULE.ID, 'numImageReplacementPaths', {
    name: 'Number of Image Folders',
    hint: 'How many image folders to configure (1-20)',
    type: Number,
    config: true,
    scope: 'world',
    default: 1,
    range: { min: 1, max: 20 },
    requiresReload: true,  // Need reload to show/hide path fields
    group: WORKFLOW_GROUPS.AUTOMATION
});

// Dynamically register numbered path settings
function registerImageReplacementPaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numImageReplacementPaths') || 1;
    
    for (let i = 1; i <= numPaths; i++) {
        const settingKey = `tokenImageReplacementPath${i}`;
        
        // Skip if already registered
        if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
            continue;
        }
        
        game.settings.register(MODULE.ID, settingKey, {
            name: `Image Folder ${i}`,
            hint: `Path to folder ${i} containing token replacement images`,
            type: String,
            config: true,
            scope: 'world',
            default: '',
            requiresReload: false,
            group: WORKFLOW_GROUPS.AUTOMATION
        });
    }
}

// Helper function to get all configured paths
static getTokenImagePaths() {
    const numPaths = getSettingSafely(MODULE.ID, 'numImageReplacementPaths', 1);
    const paths = [];
    
    // Migration: Check old single path setting first
    const oldPath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath', '');
    if (oldPath && numPaths === 1) {
        // Migrate old path to new setting
        const firstPath = getSettingSafely(MODULE.ID, 'tokenImageReplacementPath1', '');
        if (!firstPath) {
            game.settings.set(MODULE.ID, 'tokenImageReplacementPath1', oldPath);
            paths.push(oldPath);
            return paths;
        }
    }
    
    // Get all numbered paths
    for (let i = 1; i <= numPaths; i++) {
        const path = getSettingSafely(MODULE.ID, `tokenImageReplacementPath${i}`, '');
        if (path && path.trim() !== '') {
            paths.push(path.trim());
        }
    }
    
    return paths;
}
```

**Benefits of This Approach:**
- ✅ Consistent with existing compendium pattern
- ✅ Users can add/remove paths by changing `numImageReplacementPaths`
- ✅ Each path is a separate setting (easier to manage)
- ✅ Settings UI automatically shows/hides fields based on count
- ✅ No parsing needed (no comma-separated strings)
- ✅ Easy to add FilePicker integration per path (if desired)

### 2. Cache Structure Changes

**Current Cache Metadata:**
```javascript
{
    v: '1.4',
    bp: basePath,  // Single base path
    // ...
}
```

**Proposed Cache Metadata:**
```javascript
{
    v: '1.5',  // Bump version for multi-folder support
    bp: [basePath1, basePath2, ...],  // Array of base paths (for reference)
    // Each file tracks its source:
    // files: [
    //     [fileName, { ...fileData, sourcePath: basePath1, sourceIndex: 1 }],
    //     ...
    // ]
}
```

**Recommendation:** Store `sourcePath` and `sourceIndex` in each file's metadata:
```javascript
// In _processFileInfo():
const fileInfo = {
    // ... existing fields ...
    sourcePath: basePath,      // NEW: Track which folder this came from
    sourceIndex: pathIndex,    // NEW: Which numbered path (1, 2, 3, etc.)
    fullPath: `${basePath}/${filePath}`,
};
```

**Why track both?**
- `sourcePath`: Full path string (for display/debugging)
- `sourceIndex`: Number (1, 2, 3...) matches the setting number (easier to reference)

**Benefits:**
- Can identify which folder each image came from
- Easier to debug path issues
- Supports incremental updates per folder
- Backward compatible (can infer from fullPath if missing)

### 3. Scanning Changes

**Current:**
```javascript
static async _scanFolderStructure(basePath) {
    // Scans single basePath
}
```

**Proposed:**
```javascript
static async _scanFolderStructure(basePaths = null) {
    const paths = basePaths || this.getTokenImagePaths();
    
    if (paths.length === 0) {
        postConsoleAndNotification(MODULE.NAME, "No image paths configured", "", true, false);
        return;
    }
    
    // Scan each path with its index
    for (let i = 0; i < paths.length; i++) {
        const basePath = paths[i];
        const pathIndex = i + 1;  // 1-based index (matches setting number)
        await this._scanSingleFolder(basePath, pathIndex);
    }
}

static async _scanSingleFolder(basePath, pathIndex) {
    // Existing scanning logic, but:
    // 1. Tag each file with sourcePath and sourceIndex
    // 2. Handle duplicate filenames (same name, different folders)
    // 3. Update cache incrementally per folder
    // 4. Pass pathIndex to _processFileInfo() for metadata
}
```

**Duplicate Filename Handling:**
```javascript
// Current: cache.files.set(fileName.toLowerCase(), fileInfo)
// Problem: Last file wins if same filename in multiple folders

// Solution: Use composite key or track all variants
const cacheKey = `${basePath}:${fileName}`.toLowerCase();
this.cache.files.set(cacheKey, fileInfo);

// OR: Store array of files per filename
if (!this.cache.files.has(fileName.toLowerCase())) {
    this.cache.files.set(fileName.toLowerCase(), []);
}
this.cache.files.get(fileName.toLowerCase()).push(fileInfo);
```

**Recommendation:** Use composite key approach for simplicity:
- Key: `${sourcePath}:${fileName}`.toLowerCase()
- Display: Show source folder in UI when duplicates exist
- Matching: Check all variants, prefer best match

### 4. UI Changes

**TokenImageReplacementWindow:**
- Show source folder in tooltip/results
- Filter by source folder (new category)
- Handle duplicate filenames gracefully

```javascript
// In _renderResults():
const sourceFolder = match.metadata?.sourcePath || 'Unknown';
const tooltipText = `${match.name}\nSource: ${sourceFolder}\n...`;
```

---

## Extension Plan: Portrait Support

### 1. Separate Cache System

**New Settings (Following Numbered Pattern):**
```javascript
// Number of portrait paths
game.settings.register(MODULE.ID, 'numPortraitImageReplacementPaths', {
    type: Number,
    config: true,
    scope: 'world',
    default: 1,
    range: { min: 1, max: 20 },
    requiresReload: true,
    group: WORKFLOW_GROUPS.AUTOMATION
});

// Dynamically register numbered portrait path settings
function registerPortraitImageReplacementPaths() {
    const numPaths = game.settings.get(MODULE.ID, 'numPortraitImageReplacementPaths') || 1;
    
    for (let i = 1; i <= numPaths; i++) {
        const settingKey = `portraitImageReplacementPath${i}`;
        
        if (game.settings.settings.has(`${MODULE.ID}.${settingKey}`)) {
            continue;
        }
        
        game.settings.register(MODULE.ID, settingKey, {
            name: `Portrait Image Folder ${i}`,
            hint: `Path to folder ${i} containing portrait replacement images`,
            type: String,
            config: true,
            scope: 'world',
            default: '',
            requiresReload: false,
            group: WORKFLOW_GROUPS.AUTOMATION
        });
    }
}

// Portrait cache (hidden, managed by system)
game.settings.register(MODULE.ID, 'portraitImageReplacementCache', {
    type: String,
    default: '',
    config: false,
    scope: 'world'
});

// Portrait enabled toggle
game.settings.register(MODULE.ID, 'portraitImageReplacementEnabled', {
    type: Boolean,
    default: false,
    config: true,
    scope: 'world',
    group: WORKFLOW_GROUPS.AUTOMATION
});
```

**New Cache Manager:**
```javascript
// Option A: Separate class (cleaner separation)
export class PortraitCacheManager {
    static cache = { /* same structure as ImageCacheManager */ };
    // Duplicate all methods, but target actor.img instead of token.texture.src
}

// Option B: Unified manager with mode flag (less duplication)
export class ImageCacheManager {
    static MODES = {
        TOKEN: 'token',
        PORTRAIT: 'portrait'
    };
    
    static getCache(mode = 'token') {
        return mode === 'portrait' ? this.portraitCache : this.cache;
    }
    
    static getCacheSetting(mode = 'token') {
        const key = mode === 'portrait' 
            ? 'portraitImageReplacementCache' 
            : 'tokenImageReplacementCache';
        return game.settings.get(MODULE.ID, key);
    }
}
```

**Recommendation:** Use **Option B** (unified manager) to reduce code duplication:
- Most logic is identical (scanning, matching, caching)
- Only differences: target field (`texture.src` vs `img`) and cache storage key
- Add `mode` parameter to relevant methods

### 2. Cache Structure

**Portrait Cache:**
- Same structure as token cache
- Separate storage key: `portraitImageReplacementCache`
- Can share same folder paths OR use separate paths
- Same metadata extraction (portraits still have creature types, etc.)

### 3. Application Logic

**Token Replacement (existing):**
```javascript
await tokenDocument.update({ 'texture.src': imagePath });
```

**Portrait Replacement (new):**
```javascript
await actor.update({ img: imagePath });
```

**New Window/UI:**
- Option A: Separate window (`PortraitImageReplacementWindow`)
- Option B: Mode toggle in existing window
- **Recommendation:** Mode toggle (less UI clutter)

```javascript
// In TokenImageReplacementWindow:
constructor(options = {}) {
    super(options);
    this.mode = options.mode || 'token';  // 'token' or 'portrait'
    // ...
}

static openWindow(mode = 'token') {
    const window = new TokenImageReplacementWindow({ mode });
    // ...
}
```

### 4. Matching Logic

**Current:** Matches based on token characteristics
**Portrait:** Same matching logic (actor data is same)

**Key Difference:** Selection context
- Token: `canvas.tokens.controlled[0]`
- Portrait: Selected actor in actor directory OR token's actor

```javascript
// In _checkForSelectedToken():
if (this.mode === 'portrait') {
    // Get selected actor from actor directory
    const selectedActor = ui.actors?.viewed?.length > 0 
        ? ui.actors.viewed[0] 
        : canvas.tokens.controlled[0]?.actor;
    
    if (selectedActor) {
        this.selectedActor = selectedActor;
        // Use actor.img as current image
    }
} else {
    // Existing token logic
    const selectedToken = canvas.tokens.controlled[0];
    // ...
}
```

---

## Implementation Priority

### Phase 1: Multiple Folders (Easier)
1. ✅ Add `tokenImageReplacementPaths` setting (comma-separated)
2. ✅ Migration: Copy old `tokenImageReplacementPath` to new setting
3. ✅ Update `_scanFolderStructure()` to handle array of paths
4. ✅ Add `sourcePath` to file metadata
5. ✅ Update cache version to `'1.5'`
6. ✅ Update UI to show source folder
7. ✅ Handle duplicate filenames

### Phase 2: Portrait Support (More Complex)
1. ✅ Add portrait settings (`portraitImageReplacementEnabled`, `portraitImageReplacementPaths`, `portraitImageReplacementCache`)
2. ✅ Refactor `ImageCacheManager` to support mode parameter
3. ✅ Create `portraitCache` structure (separate from `cache`)
4. ✅ Update `TokenImageReplacementWindow` to support mode toggle
5. ✅ Add portrait selection logic (actor directory + token actor)
6. ✅ Update application logic (`actor.update({ img })`)
7. ✅ Test with both token and portrait modes

---

## Code Changes Summary

### Files to Modify

1. **`scripts/settings.js`**
   - Add `numImageReplacementPaths` setting (Number, 1-20)
   - Add `registerImageReplacementPaths()` function (similar to `registerDynamicCompendiumTypes()`)
   - Register numbered `tokenImageReplacementPath1`, `tokenImageReplacementPath2`, etc.
   - Add portrait settings (same pattern: `numPortraitImageReplacementPaths`, `portraitImageReplacementPath1`, etc.)
   - Migration logic for old single path (copy to `tokenImageReplacementPath1`)

2. **`scripts/manager-image-cache.js`**
   - Add `getTokenImagePaths()` helper
   - Update `_scanFolderStructure()` to handle multiple paths
   - Add `sourcePath` to file metadata
   - Add mode support (`token` vs `portrait`)
   - Add `portraitCache` structure
   - Update cache save/load for both caches

3. **`scripts/token-image-replacement.js`**
   - Add mode parameter to constructor
   - Update selection logic for portraits
   - Update UI to show mode toggle
   - Update application logic (`texture.src` vs `img`)

4. **`scripts/token-image-utilities.js`**
   - No changes needed (handles token updates only)

### Backward Compatibility

- **Migration:** Check for old `tokenImageReplacementPath`, copy to new `tokenImageReplacementPaths`
- **Cache Loading:** Handle old cache format (single `bp` string) and convert to array
- **Default Behavior:** If no paths configured, show helpful error message

---

## Testing Checklist

### Multiple Folders
- [ ] `numImageReplacementPaths` setting works (1-20)
- [ ] Numbered path settings (`tokenImageReplacementPath1`, etc.) register correctly
- [ ] Migration from old single path to new numbered system works
- [ ] Scan multiple folders successfully
- [ ] Each file tracks `sourcePath` and `sourceIndex` correctly
- [ ] Handle duplicate filenames (same name, different folders)
- [ ] Show source folder/index in UI
- [ ] Filter by source folder works
- [ ] Incremental updates work per folder
- [ ] Cache loads/saves correctly with multiple paths
- [ ] Changing `numImageReplacementPaths` shows/hides path fields correctly

### Portrait Support
- [ ] Portrait cache scans separately from token cache
- [ ] Portrait window opens from actor directory
- [ ] Portrait window opens from token context menu
- [ ] Portrait replacement updates `actor.img` correctly
- [ ] Portrait matching uses same algorithm as tokens
- [ ] Mode toggle works in UI
- [ ] Both caches can exist simultaneously

---

## Questions for Consideration

1. **Folder Priority:** If same filename exists in multiple folders, which takes precedence?
   - **Recommendation:** Show all variants, let user choose (or use best match score)

2. **Portrait Paths:** Should portraits use same folders as tokens, or separate?
   - **Recommendation:** Separate paths (more flexible, clearer organization)

3. **Cache Size:** With multiple folders + portraits, cache could get large. Compression strategy?
   - **Recommendation:** Current compression is fine, but monitor size warnings

4. **UI Complexity:** Separate windows vs mode toggle?
   - **Recommendation:** Mode toggle (less clutter, shared code)

5. **Migration Path:** How to handle users with existing single-path setup?
   - **Recommendation:** Auto-migrate on first load, show notification

