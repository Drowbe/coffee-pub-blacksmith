# Portrait Image Replacement - Migration Plan

## Overview
This document outlines the migration plan to fully separate Token and Portrait image replacement experiences while maintaining shared core functionality.

## Current State Assessment

### ✅ What's Working
1. **Separate Caches** - `portraitCache` and `cache` are separate
2. **Mode Toggle** - UI toggle exists to switch between token/portrait
3. **Mode-Specific Selection** - Portrait checks actor directory, token checks canvas
4. **Mode-Specific Application** - Portrait uses `actor.update({ img })`, token uses `token.update({ texture.src })`
5. **Tags** - Already mode-aware via `getCache(this.mode)`

### ❌ What's Missing

## Phase 1: Core Functionality (Critical - Do First)

### 1.1 Scan and Cache Management
- [ ] **`scanForImages(mode)`** - Update to accept mode parameter
  - Currently uses `this.cache` directly
  - Should scan the correct cache based on mode
  - Dialog should show mode-specific file count
  - Update: `await ImageCacheManager.scanForImages(this.mode)`

- [ ] **`refreshCache(mode)`** - Update to accept mode parameter
  - Currently uses `this.cache` directly
  - Should refresh the correct cache based on mode
  - Update: `await ImageCacheManager.refreshCache(this.mode)`

- [ ] **`_onScanImages()`** - Pass mode to scan function
  - Currently calls `scanForImages()` without mode
  - Update: `await ImageCacheManager.scanForImages(this.mode)`

- [ ] **Delete Cache** - Make mode-aware
  - Should delete only the current mode's cache
  - Update `_onDeleteCache()` to use `this.mode`

- [ ] **Pause Cache** - Make mode-aware
  - Should pause only the current mode's scan
  - Update `_onPauseCache()` to use `this.mode`

### 1.2 Categories
- [ ] **`getDiscoveredCategories(mode)`** - Update to accept mode parameter
  - Currently uses `this.cache.folders` directly
  - Should use `getCache(mode).folders`
  - Update: `ImageCacheManager.getDiscoveredCategories(this.mode)`

- [ ] **`_getCategories()`** - Pass mode to category discovery
  - Currently calls `getDiscoveredCategories()` without mode
  - Update: `ImageCacheManager.getDiscoveredCategories(this.mode)`

## Phase 2: Search and Matching (Important)

### 2.1 Search Terms
- [ ] **`_getSearchTerms()`** - Update to handle portrait mode
  - **Requirement**: Extract from actor name, type, and other actor fields (same as token extraction)
  - Currently extracts from `token.document`
  - Portrait mode should extract from `actor` object
  - Used in `_getAggregatedTags()` and filtering logic
  - Update signature: `_getSearchTerms(source, mode)` where source is token.document or actor

### 2.2 Thumbnail Display
- [ ] **Thumbnail Context** - Show mode-appropriate info
  - **Requirement**: Portrait thumbnails should show actor info instead of token info
  - Token mode: Show token name, actor type, etc. (current behavior)
  - Portrait mode: Show actor name, type, etc.
  - Update template data in `getData()` to include mode-specific thumbnail context
  - Update template rendering to conditionally show token vs actor info

### 2.3 Category Labels
- [ ] **Category Button Labels** - Make mode-specific
  - **Requirement**: Category buttons should be labeled differently in portrait mode
  - Keep same folder-based names but add mode context
  - Example: "Humanoids" in token mode vs "Portrait: Humanoids" in portrait mode
  - Or: Add mode indicator to category display

## Phase 3: UI Restructure (Important)

### 3.1 Global Controls Header
- [ ] **New Header Section** - Add above `<div class="tir-header">`
  - **Requirement**: Create new div above existing header for global controls
  - Contains switches that apply to both tokens and portraits:
    - Token/Portrait mode toggle (moved from current header)
    - "Convert Dead" toggle
    - "Loot Dead" toggle
  - These controls are global and affect both modes
  - Structure:
    ```html
    <div class="tir-global-controls">
      <!-- Mode Toggle -->
      <!-- Convert Dead Toggle -->
      <!-- Loot Dead Toggle -->
    </div>
    <div class="tir-header">
      <!-- Existing header content -->
    </div>
    ```

### 3.2 Mode-Specific Controls
- [ ] **Move Mode-Specific Controls** - Keep in main header
  - Fuzzy Search (applies to current mode)
  - Update Dropped (applies to current mode)
  - Matching Threshold (applies to current mode)
  - Scan for Images button (mode-specific)
  - Delete Cache button (mode-specific)

### 3.3 Button Labels
- [ ] **Mode-Specific Button Labels**
  - "Scan for Images" → "Scan for Tokens" / "Scan for Portraits"
  - Update based on current mode
  - All action buttons should reflect current mode

## Phase 4: Cache Operations (Critical)

### 4.1 Delete Cache Behavior
- [ ] **Delete Cache** - Mode-specific behavior
  - **Requirement**: Buttons act only on the mode they are in
  - If in token mode: Delete deletes token cache only
  - If in portrait mode: Delete deletes portrait cache only
  - Update `_onDeleteCache()` to use `this.mode`
  - Update `ImageCacheManager.deleteCache(mode)` if needed

### 4.2 All Cache Operations
- [ ] **All Operations Mode-Aware**
  - **Requirement**: Entire experience should behave mode-specifically
  - Scan, refresh, delete, pause all operate on current mode's cache
  - Categories, tags, search results all from current mode's cache
  - No cross-contamination between modes

## Phase 5: Status Messages and Notifications

### 5.1 Mode-Specific Messages
- [ ] **All Notifications** - Include mode context
  - "Token Image Replacement: ..." vs "Portrait Image Replacement: ..."
  - Update all `postConsoleAndNotification()` calls to include mode label
  - Update all `ui.notifications` calls to include mode context

### 5.2 Progress Indicators
- [ ] **Scan Progress** - Mode-specific
  - Progress bars show mode-specific scan progress
  - Status text: "Scanning Token Images..." vs "Scanning Portrait Images..."
  - Already partially implemented, verify completeness

## Implementation Order

### Step 1: Core Cache Operations (Phase 1.1)
1. Update `scanForImages(mode)`
2. Update `refreshCache(mode)`
3. Update `_onScanImages()` to pass mode
4. Update delete/pause cache handlers

### Step 2: Categories (Phase 1.2)
1. Update `getDiscoveredCategories(mode)`
2. Update `_getCategories()` to pass mode

### Step 3: Search Terms (Phase 2.1)
1. Update `_getSearchTerms()` to handle actor vs token
2. Update all call sites to pass mode

### Step 4: UI Restructure (Phase 3)
1. Create new global controls header
2. Move mode toggle to global header
3. Move "Convert Dead" and "Loot Dead" to global header
4. Update CSS for new layout

### Step 5: Thumbnail Display (Phase 2.2)
1. Update template data for mode-specific context
2. Update template rendering
3. Test both modes

### Step 6: Polish (Phase 4 & 5)
1. Update all button labels
2. Update all notifications
3. Verify mode-specific behavior throughout

## Testing Checklist

### Token Mode
- [ ] Scan for images scans token cache only
- [ ] Categories show token-specific folders
- [ ] Tags are from token cache only
- [ ] Thumbnails show token info
- [ ] Search terms extracted from token
- [ ] Apply updates token texture
- [ ] Delete cache deletes token cache only

### Portrait Mode
- [ ] Scan for images scans portrait cache only
- [ ] Categories show portrait-specific folders
- [ ] Tags are from portrait cache only
- [ ] Thumbnails show actor info
- [ ] Search terms extracted from actor
- [ ] Apply updates actor portrait
- [ ] Delete cache deletes portrait cache only

### Mode Switching
- [ ] Switching modes preserves selection state appropriately
- [ ] Categories update when switching modes
- [ ] Tags update when switching modes
- [ ] Search results clear/reset appropriately
- [ ] Cache operations work correctly after mode switch

### Global Controls
- [ ] Mode toggle works and saves preference
- [ ] Convert Dead applies to both modes
- [ ] Loot Dead applies to both modes
- [ ] Global controls always visible regardless of mode

## Phase 6: Bulk Migration Tool (New Feature)

### 6.1 Migration Button and UI
- [ ] **Add Migration Button** - Add to window UI (likely in settings or as a separate action)
  - Button label: "Migrate Tokens" / "Migrate Portraits" (mode-specific)
  - Should be accessible from the main window or settings
  - Requires confirmation dialog before running

- [ ] **Migration Settings** - Add settings for migration configuration
  - Compendium selection (dropdown/checkbox list)
  - Option to include world actors/tokens
  - Option to migrate tokens only, portraits only, or both
  - Option to create backup before migration

### 6.2 Migration Logic
- [ ] **Scan World and Compendiums** - Find all tokens/actors to migrate
  - Iterate through world actors (if enabled)
  - Iterate through selected compendiums (if enabled)
  - Extract current image paths from tokens/actors
  - Extract filenames from image paths

- [ ] **Match by Filename** - Match existing images to cache
  - For each token/actor image:
    - Extract filename from current image path
    - Search image replacement cache for matching filename
    - Use case-insensitive matching
    - Handle path variations (different base paths, etc.)

- [ ] **Apply Migration** - Update tokens/actors with matched images
  - For token mode: Update `token.document.texture.src` with matched image
  - For portrait mode: Update `actor.img` with matched image
  - Show progress indicator (X of Y migrated)
  - Log all changes for review

- [ ] **Migration Report** - Show results after migration
  - Total tokens/actors scanned
  - Number successfully migrated
  - Number not found in cache
  - List of unmatched items (optional)
  - Option to export report

### 6.3 Implementation Details
- [ ] **Migration Function** - Create `migrateTokensToImageReplacement(mode, options)`
  - Parameters:
    - `mode`: 'token' or 'portrait'
    - `options`: { compendiums: [], includeWorld: boolean, createBackup: boolean }
  - Returns: Migration report object

- [ ] **Filename Matching** - Robust filename extraction and matching
  - Extract filename from various path formats
  - Handle URL-encoded paths
  - Handle different file extensions (.webp, .png, .jpg, etc.)
  - Case-insensitive comparison
  - Handle duplicate filenames (use first match or priority)

- [ ] **Progress Tracking** - Show migration progress
  - Progress bar for large migrations
  - Real-time count updates
  - Ability to cancel long-running migrations

- [ ] **Error Handling** - Graceful error handling
  - Continue migration even if individual items fail
  - Log errors for review
  - Don't break on permission errors (skip and continue)

### 6.4 Safety Features
- [ ] **Backup Option** - Create backup before migration
  - Save original image paths to a backup structure
  - Option to restore from backup
  - Backup stored in module settings or separate file

- [ ] **Dry Run Mode** - Preview migration without applying
  - Show what would be migrated
  - Show matches and non-matches
  - Allow user to review before applying

- [ ] **Confirmation Dialog** - Require explicit confirmation
  - Show summary of what will be migrated
  - Show number of items affected
  - Require typing "MIGRATE" or similar to confirm

### 6.5 UI Integration
- [ ] **Migration Button Placement** - Add to appropriate location
  - Option 1: Settings panel (module settings)
  - Option 2: Image Replacement window (toolbar or menu)
  - Option 3: Separate migration dialog/window

- [ ] **Migration Dialog** - Create migration configuration dialog
  - Checkboxes for compendiums
  - Checkbox for "Include World Actors"
  - Radio buttons for mode (Token/Portrait/Both)
  - Checkbox for "Create Backup"
  - Checkbox for "Dry Run" (preview only)
  - Start/Cancel buttons

- [ ] **Progress Window** - Show migration progress
  - Progress bar
  - Current item being processed
  - Success/failure counts
  - Cancel button

- [ ] **Results Window** - Show migration results
  - Summary statistics
  - List of migrated items
  - List of unmatched items
  - Export button (CSV/JSON)
  - Close button

## Notes

- **Code Reuse**: Maintain shared code where appropriate (search logic, matching, UI components)
- **Cache Separation**: Ensure no cross-contamination between token and portrait caches
- **User Experience**: Mode switching should feel seamless, with appropriate state management
- **Performance**: Both caches can be initialized independently, no performance impact from separation
- **Migration Safety**: Always provide backup and dry-run options for bulk operations

