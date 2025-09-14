# Token Image Replacement Architecture

## Overview
The Token Image Replacement system is a FoundryVTT module that allows GMs to automatically replace token images with better alternatives from a cached library of images. The system consists of two main classes: `TokenImageReplacementWindow` (the UI) and `TokenImageReplacement` (the core logic and cache).

## Core Classes

### TokenImageReplacementWindow
**Purpose**: Handles the UI window for manual image selection and replacement.

**Key Properties**:
- `selectedToken`: Currently selected token on canvas (null if none)
- `matches`: Array of currently displayed results (paginated subset)
- `allMatches`: Array of all matching results (for pagination)
- `currentFilter`: Active filter ('all', 'selected', 'adversaries', 'creatures', 'npcs', 'monsters', 'bosses')
- `currentPage`: Current page for pagination
- `resultsPerPage`: Number of results per page (50)
- `isSearching`: Whether a search is in progress
- `isScanning`: Whether cache scanning is in progress

### TokenImageReplacement
**Purpose**: Core logic, cache management, and automatic token replacement.

**Key Properties**:
- `cache`: Static cache object containing all image data
- `SUPPORTED_FORMATS`: Array of supported image formats ['.webp', '.png', '.jpg', '.jpeg']

## Cache System

### Cache Structure
```javascript
static cache = {
    files: new Map(),           // filename -> full path mapping
    folders: new Map(),         // folder path -> array of files
    creatureTypes: new Map(),   // creature type -> array of files
    lastScan: null,            // timestamp of last scan
    isScanning: false,         // prevent multiple simultaneous scans
    isPaused: false,           // pause state for scanning
    totalFiles: 0,             // total count for progress tracking
    overallProgress: 0,        // current step in overall process
    totalSteps: 0,             // total steps in overall process
    currentStepName: '',       // name of current step/folder
    currentStepProgress: 0,    // current item in current step
    currentStepTotal: 0,       // total items in current step
    currentPath: '',           // remaining folder path
    currentFileName: ''        // current file being processed
};
```

## Data Flow

### 1. Window Initialization
1. `TokenImageReplacement.openWindow()` is called
2. New `TokenImageReplacementWindow` instance is created
3. Window renders with template `window-token-replacement.hbs`
4. `_checkForSelectedToken()` is called to detect any selected tokens
5. If token selected: `currentFilter = 'selected'`, call `_findMatches()`
6. If no token: `currentFilter = 'all'`, call `_findMatches()`

### 2. Finding Matches (`_findMatches()`)
1. Reset `matches` and `allMatches` arrays
2. If token selected: Add current token image as first match
3. Check cache status and set appropriate notifications
4. If cache has files:
   - Call `_getFilteredFiles()` to get files based on current filter
   - Take first 50 files and add to `allMatches`
   - Set `foundMatches = true`
5. Call `_applyPagination()` to populate `matches` from `allMatches`
6. Call `_updateResults()` to update UI

### 3. Filtering (`_getFilteredFiles()`)
**Input**: All files from cache
**Output**: Filtered subset based on `currentFilter`

**Filter Types**:
- `'all'`: Returns all files
- `'selected'`: Returns files matching selected token's search terms
- `'adversaries'`: Returns files with 'adversaries' or 'enemies' in path/name
- `'creatures'`: Returns files with 'creatures' in path/name
- `'npcs'`: Returns files with 'npcs' in path/name
- `'monsters'`: Returns files with 'monsters' in path/name
- `'bosses'`: Returns files with 'bosses' in path/name

### 4. Pagination (`_applyPagination()`)
1. Calculate start/end indices based on `currentPage` and `resultsPerPage`
2. Slice `allMatches` to populate `matches` array
3. Set `hasMoreResults` flag

### 5. Rendering (`_renderResults()`)
**Input**: `this.matches` array
**Output**: HTML string for display

**Rendering Logic**:
1. If no token selected AND no matches: Show "No TOKEN" message
2. If no matches: Show "No MATCHES" message  
3. If matches exist: Render thumbnail grid with image data

### 6. UI Update (`_updateResults()`)
1. Call `_renderResults()` to get HTML
2. Insert HTML into `.tir-thumbnails-grid` element
3. Update results count display (`#tir-results-details-count`)
4. Update status display (`#tir-results-details-status`)
5. Update aggregated tags display
6. Re-attach event handlers for thumbnail clicks

## Filter System

### Filter Categories
- **All**: Shows all cached images (17,520+ files)
- **Selected**: Shows images matching the selected token's characteristics
- **Adversaries**: Shows images in 'adversaries' or 'enemies' folders
- **Creatures**: Shows images in 'creatures' folders
- **NPCs**: Shows images in 'npcs' folders
- **Monsters**: Shows images in 'monsters' folders
- **Bosses**: Shows images in 'bosses' folders

### Filter Logic
Each filter uses `_getFilteredFiles()` to:
1. Get all files from cache
2. Apply category-specific filtering based on path/name patterns
3. Return filtered subset

## Search System

### Manual Search (`_performSearch()`)
1. Clear previous results
2. Add current token image if selected
3. Get filtered files based on current filter
4. Perform fast filename search within filtered files
5. Sort results by relevance score
6. Apply pagination and update UI
7. Start comprehensive background search

### Search Scoring
- Current image: Always first
- Filename matches: Higher scores
- Creature type matches: 90 points
- Folder name matches: 50 points
- Extension matches: 30 points

## Current Issue Analysis

### Problem
When no token is selected and "All" filter is active:
- ✅ 50 results are found and added to `allMatches`
- ✅ HTML is generated (62,366 characters)
- ✅ HTML is inserted into DOM
- ✅ Results count is updated to "50 of 50 Showing"
- ❌ Visual display still shows "0 of 0 Showing" and empty grid

### Root Cause
The issue appears to be a **CSS visibility problem**. The HTML is correctly generated and inserted into the DOM, but something is preventing the visual display from updating. This could be:

1. **CSS hiding the results**: Some CSS rule hiding `.tir-thumbnails-grid` or `.tir-thumbnail-item` elements
2. **Window re-rendering issue**: The window not re-rendering after DOM updates
3. **Template binding issue**: The Handlebars template not updating properly
4. **Timing issue**: Some asynchronous operation overwriting the results

### Evidence
- Console logs show correct data flow
- DOM contains correct HTML
- Results count updates correctly
- Same code works when token is selected
- Issue only occurs with "All" filter when no token selected

## Key Methods

### Window Methods
- `_checkForSelectedToken()`: Detects selected tokens on window open
- `_findMatches()`: Main method to find and populate results
- `_getFilteredFiles()`: Filters files based on current category
- `_applyPagination()`: Handles pagination logic
- `_renderResults()`: Generates HTML for results display
- `_updateResults()`: Updates UI with new results

### Core Methods
- `_getSearchTerms()`: Extracts search terms from token document
- `_findBestMatch()`: Finds best matching image for token
- `_calculateMatchScore()`: Calculates relevance score for matches
- `_initializeCache()`: Initializes the image cache system

## Template Structure

### Main Sections
1. **Header**: Token info, cache status, scan progress
2. **Controls**: Delete cache, scan images, refresh detection
3. **Search**: Search input field
4. **Filters**: Category filters and result counts
5. **Tags**: Aggregated tags (if any)
6. **Grid**: Image thumbnails (`.tir-thumbnails-grid`)
7. **Loading**: Loading indicators

### Key Elements
- `.tir-thumbnails-grid`: Container for image thumbnails
- `#tir-results-details-count`: Results count display
- `#tir-results-details-status`: Status display
- `#tir-search-tools-tag-container`: Tags container

## CSS Classes

### Grid Classes
- `.tir-thumbnails-grid`: Main grid container
- `.tir-thumbnail-item`: Individual thumbnail item
- `.tir-thumbnail-image`: Image container
- `.tir-thumbnail-tag`: Tag elements

### State Classes
- `.tir-no-token`: No token selected state
- `.tir-no-matches`: No matches found state
- `.tir-current-image`: Current token image
- `.tir-search-spinner`: Search loading state

## Event Handlers

### Window Events
- `_onTokenSelectionChange()`: Handles token selection changes
- `_onFilterClick()`: Handles filter button clicks
- `_onSelectImage()`: Handles image selection
- `_onScroll()`: Handles infinite scroll loading

### Search Events
- `_onSearchInput()`: Handles search input changes
- `_onClearSearch()`: Handles search clearing
- `_onTagClick()`: Handles tag clicks

## Dependencies

### External
- FoundryVTT Application system
- Handlebars templating
- jQuery for DOM manipulation

### Internal
- `const.js`: Module constants
- `api-core.js`: Logging and settings utilities
- `manager-hooks.js`: Hook management system

## Performance Considerations

### Caching
- All images are cached in memory for fast access
- Cache is built incrementally with progress tracking
- Cache can be paused/resumed during scanning

### Pagination
- Results are paginated (50 per page) for performance
- Infinite scroll loads more results as needed
- Fast search shows immediate results, comprehensive search runs in background

### Search Optimization
- Two-phase search: fast filename search first, comprehensive search second
- Search scope optimization using creature types
- Cached search terms for selected token filter
