# Token Image Replacement Architecture

## Overview
The Token Image Replacement system is a FoundryVTT module that allows GMs to automatically replace token images with better alternatives from a cached library of images. The system uses a unified matching algorithm across all interfaces, with the only difference being auto-apply vs. user choice.

## Core Philosophy
**Token Drop = Selected Tab + Auto-Apply**
- Same matching algorithm, scoring system, and threshold filtering
- Only difference: Auto-apply the top result vs. show all results

**Selected Tab = Token Drop + User Choice**
- Same matching algorithm, scoring system, and threshold filtering  
- Only difference: Show all results above threshold vs. just the top one

## Core Classes

### TokenImageReplacementWindow
**Purpose**: Handles the UI window for manual image selection and replacement.

.
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

## Unified Matching System

### Three Types of Filtering

#### 1. Category/Filter Tabs (All, Creatures, etc.)
- **Purpose**: Browse available options
- **No relevance scoring** - nothing to be relative to
- **Sort by**: A-Z, Z-A, or other non-relevance criteria
- **Shows**: All files in that category

#### 2. Selected Tab
- **Purpose**: Find matches for a specific token
- **Has relevance target**: The selected token
- **Uses sophisticated scoring** - relative to token characteristics
- **Shows**: All matches above threshold, sorted by relevance

#### 3. Search Mode (any tab + search term)
- **Purpose**: Find matches for search query
- **Has relevance target**: The search terms
- **Uses sophisticated scoring** - relative to search terms
- **Shows**: All matches above threshold, sorted by relevance

## Weighted Scoring System

### Token Data Hierarchy (Most Important → Least Important)

The system extracts data from the selected token and applies configurable weights to each data point:

#### 1. **Represented Actor** (Default: 80%)
- **Most Critical**: "Goblin", "Golem", "Pixie", "Bullywug"
- **Why**: This is literally what we need an image of
- **Example**: Token name "Rinian (Bullywug Warrior)" → "Bullywug" is the key

#### 2. **Creature Class/Role** (Default: 15%)
- **High Priority**: "Fighter", "Mage", "Archer", "Warrior", "Rogue"
- **Why**: Narrows down the specific type of that creature
- **Example**: "Bullywug Warrior" vs "Bullywug Shaman"

#### 3. **Equipment** (Default: 10%)
- **Medium-High Priority**: "Sword", "Bow", "Staff", "Shield"
- **Why**: Can draw conclusions not specified in represented actor
- **Example**: "Goblin" + "Bow" = "Goblin Archer"

#### 4. **Subtype/Subrace** (Default: 8%)
- **Medium Priority**: "Goblinoid", "Dragon", "Elemental", "Undead"
- **Why**: Helps narrow the search pool
- **Example**: "Goblin" + "Goblinoid" = more specific than just "Humanoid"

#### 5. **Background/Profession** (Default: 5%)
- **Medium-Low Priority**: "Soldier", "Noble", "Hermit", "Cultist"
- **Why**: Narrowing data, especially useful for specific contexts
- **Example**: "Cultist" + "Evil" = "Evil Cultist"

#### 6. **Size** (Default: 3%)
- **Low-Medium Priority**: "Large", "Medium", "Huge", "Small"
- **Why**: Helps narrow down, but many creatures can be the same size
- **Example**: Many creatures can be "Large"

#### 7. **Alignment** (Default: 2%)
- **Low Priority**: "Chaotic Evil", "Neutral", "Lawful Good"
- **Why**: Only useful for specific contexts like "evil cultist"
- **Example**: "Cultist" + "Evil" = more specific than just "Cultist"

### Configurable Weighting

Each token data point has a configurable slider (0-100%) in the module settings:

```javascript
// Settings for token data weighting
game.settings.register(MODULE.ID, 'tokenImageReplacementWeightRepresentedActor', {
    name: 'Represented Actor Weight',
    hint: 'How important the represented actor name is for matching (e.g., "Goblin", "Bullywug")',
    type: Number,
    config: true,
    scope: 'world',
    range: { min: 0, max: 100, step: 5 },
    default: 80
});

game.settings.register(MODULE.ID, 'tokenImageReplacementWeightCreatureClass', {
    name: 'Creature Class Weight',
    hint: 'How important the creature class/role is for matching (e.g., "Warrior", "Mage")',
    type: Number,
    config: true,
    scope: 'world',
    range: { min: 0, max: 100, step: 5 },
    default: 15
});

// ... additional settings for each data point
```

### Scoring Calculation

The final score is calculated as:

```
Final Score = (Token Data Score + File Metadata Score + Bonuses) × Penalties
```

Where:
- **Token Data Score**: Sum of weighted token data matches
- **File Metadata Score**: Sum of weighted file metadata matches  
- **Bonuses**: Multi-word bonus, basic creature priority, token context
- **Penalties**: Deprioritized words penalty

### Example Scoring

For a "Bullywug Warrior" token vs "Bullywug_Warrior_A1_Sword_01.webp":

- **"Bullywug" match**: 80% × 0.8 = **64%**
- **"Warrior" match**: 15% × 0.8 = **12%**
- **"Sword" match**: 10% × 0.8 = **8%**
- **"Monstrosity" match**: 8% × 0.8 = **6.4%**
- **"Large" match**: 3% × 0.8 = **2.4%**
- **Total**: ~**93%** (excellent match)

For the same token vs "Sea_Serpent_A1_Segment_A_Huge_Dragon_01.webp":

- **"Bullywug" match**: 0% (no match)
- **"Monstrosity" match**: 8% × 0.8 = **6.4%**
- **"Large" match**: 3% × 0.8 = **2.4%**
- **Total**: ~**9%** (poor match)

This makes Bullywug images score **10x higher** than Sea Serpent images!

### Unified Logic Flow
```
IF (has token target OR has search terms):
    ├── Use sophisticated scoring algorithm
    ├── Apply threshold filtering
    ├── Sort by relevance score
    └── Show all results above threshold

ELSE (browsing mode):
    ├── No scoring (all get same score)
    ├── No threshold filtering
    ├── Sort by name (A-Z/Z-A)
    └── Show all results in category
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
4. Determine filtering mode:
   - **Relevance Mode** (has token target OR search terms): Use unified matching algorithm
   - **Browse Mode** (category tabs only): Use simple category filtering
5. Call `_applyPagination()` to populate `matches` from `allMatches`
6. Call `_updateResults()` to update UI

### 3. Unified Matching Algorithm
**Input**: Files from cache + relevance target (token or search terms)
**Output**: Scored and filtered results

**Process**:
1. **Search Scope Optimization**: Use creature type if available
2. **Sophisticated Scoring**: Calculate relevance scores (0.0-1.0) for all files
3. **Threshold Filtering**: Only return results above threshold setting
4. **Sorting**: Sort by relevance score (highest first)
5. **Return**: All results above threshold

### 4. Category Filtering (Browse Mode)
**Input**: All files from cache
**Output**: Filtered subset based on `currentFilter`

**Filter Types**:
- `'all'`: Returns all files
- `'creatures'`: Returns files in 'creatures' folders
- `'adversaries'`: Returns files in 'adversaries' folders
- `'npcs'`: Returns files in 'npcs' folders
- `'monsters'`: Returns files in 'monsters' folders
- `'bosses'`: Returns files in 'bosses' folders

### 5. Pagination (`_applyPagination()`)
1. Calculate start/end indices based on `currentPage` and `resultsPerPage`
2. Slice `allMatches` to populate `matches` array
3. Set `hasMoreResults` flag

### 6. Rendering (`_renderResults()`)
**Input**: `this.matches` array
**Output**: HTML string for display

**Rendering Logic**:
1. If no token selected AND no matches: Show "No TOKEN" message
2. If no matches: Show "No MATCHES" message  
3. If matches exist: Render thumbnail grid with image data
4. **Highlight recommended match** (top result in relevance mode)

### 7. UI Update (`_updateResults()`)
1. Call `_renderResults()` to get HTML
2. Insert HTML into `.tir-thumbnails-grid` element
3. Update results count display (`#tir-results-details-count`)
4. Update status display (`#tir-results-details-status`)
5. Update aggregated tags display
6. Re-attach event handlers for thumbnail clicks

## Implementation Strategy

### Phase 1: Unify Matching Algorithms
1. **Create unified `_calculateRelevanceScore()` method** that both systems use
2. **Apply the same scoring logic** to Selected tab results
3. **Use the Matching Threshold setting** for both automatic and manual matching
4. **Ensure consistent search term generation** across both systems

### Phase 2: Mark Recommended Token
1. **Calculate the "recommended" token** using the unified matching algorithm
2. **Add visual indicator** (e.g., gold border, "RECOMMENDED" badge, star icon)
3. **Show the match score** in the token card
4. **Make it clickable** to apply the automatic replacement

### Phase 3: Improve Matching Threshold Integration
1. **Apply threshold to manual search** - filter out low-scoring results
2. **Add threshold indicator** in the UI (e.g., "Showing matches above 0.3 threshold")
3. **Make threshold adjustable** from the window (not just settings)
4. **Show why results were filtered** (e.g., "5 results hidden below threshold")

### Phase 4: Enhanced UX Features
1. **Match confidence indicators** - color coding based on score
2. **"Why this match?" tooltip** - explain the scoring
3. **Quick apply button** - one-click to apply recommended match
4. **Match history** - remember recent successful matches

## Key Benefits of Unified Approach

### Consistency
- **Same behavior everywhere** - token drop and selected tab use identical logic
- **Predictable results** - users see the same matches in both interfaces
- **Unified scoring** - sophisticated algorithm applied consistently

### User Experience
- **Clear recommendations** - users see what would be auto-chosen
- **Exploration freedom** - users can see alternatives and choose
- **Transparent scoring** - users understand why matches were chosen

### Performance
- **Optimized search scope** - creature type optimization for faster searching
- **Threshold filtering** - only shows relevant results, reducing noise
- **Consistent caching** - same cache used by both systems

## Key Methods

### Unified Matching Methods
- `_calculateRelevanceScore()`: **NEW** - Unified scoring algorithm for all relevance-based matching
- `_getSearchTerms()`: Extracts search terms from token document
- `_findBestMatch()`: Finds best matching image for token (uses unified scoring)
- `_applyUnifiedMatching()`: **NEW** - Main method that determines relevance vs. browse mode

### Window Methods
- `_checkForSelectedToken()`: Detects selected tokens on window open
- `_findMatches()`: Main method to find and populate results (uses unified matching)
- `_getFilteredFiles()`: Filters files based on current category (browse mode)
- `_applyPagination()`: Handles pagination logic
- `_renderResults()`: Generates HTML for results display (highlights recommended)
- `_updateResults()`: Updates UI with new results

### Core Methods
- `_initializeCache()`: Initializes the image cache system
- `_onTokenCreated()`: Hook for automatic token replacement (uses unified matching)

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
- `.tir-recommended`: **NEW** - Recommended match highlighting
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
