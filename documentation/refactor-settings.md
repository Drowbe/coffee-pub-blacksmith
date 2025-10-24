# Settings Refactor Plan - Coffee Pub Blacksmith

## Overview
This document outlines the complete plan for refactoring the settings.js file to use workflow-based organization with helper functions while preserving all existing functionality and styling.

## Goals
- Reduce code verbosity for headers by 70%
- Organize settings by user workflow instead of technical components
- Enable FoundryVTT's native collapsible sections
- Preserve all existing CSS styling
- Maintain all setting names, values, and functionality
- No changes to other files required

## Workflow Groups

```javascript
const WORKFLOW_GROUPS = {
    GETTING_STARTED: 'getting-started',
    THEMES_AND_EXPERIENCE: 'themes-and-experience',
    RUN_THE_GAME: 'run-the-game',
    MANAGE_CONTENT: 'manage-content',
    ROLLING_AND_PROGRESSION: 'rolling-and-progression',
    AUTOMATION_AND_AI: 'automation-and-ai'
};
```

## Helper Functions

```javascript
function registerHeader(id, labelKey, hintKey, level = 'H2', group = null) {
    game.settings.register(MODULE.ID, `heading${level}${id}`, {
        name: MODULE.ID + `.${labelKey}`,
        hint: MODULE.ID + `.${hintKey}`,
        scope: "world",
        config: true,
        default: "",
        type: String,
        group: group
    });
}
```

## Migration Status Tracking

### ✅ COMPLETED MIGRATIONS

#### GETTING STARTED GROUP - ✅ COMPLETE
- ✅ `headingH1Blacksmith` - Main module title (migrated)
- ✅ `headingH4BlacksmithInstalled` - Installed modules status (migrated)
- ✅ `headingH4BlacksmithMissing` - Missing modules status (migrated)
- ✅ `headingH2General` - General section header (migrated)
- ✅ `headingH2Debug` - Debug section header (migrated)
- ✅ `headingH3simpleConsole` - Console subheader (migrated)
- ✅ `headingH3simpleDebug` - Debug subheader (migrated)
- ✅ `headingH3Latency` - Latency subheader (migrated)
- ✅ `globalFancyConsole` - Fancy console toggle (migrated)
- ✅ `globalDebugMode` - Debug mode toggle (migrated)
- ✅ `globalConsoleDebugStyle` - Console debug style (migrated)
- ✅ `enableLatency` - Enable latency checking (migrated)
- ✅ `latencyCheckInterval` - Latency check interval (migrated)

#### THEMES AND EXPERIENCE GROUP - ✅ PARTIAL
- ✅ `headingH2Themes` - Themes section header (migrated)
- ✅ `headingH3CSS` - CSS customization header (migrated - FIXED localization)
- ✅ `customCSS` - Custom CSS storage (migrated)
- ✅ `cssTransition` - Smooth transitions (migrated)
- ✅ `cssDarkMode` - Dark mode toggle (migrated)
- ⏳ `toolbarShowDividers` - Show toolbar dividers (pending)
- ⏳ `toolbarShowLabels` - Show toolbar labels (pending)
- ⏳ `smoothTransition` - Smooth transitions (pending)
- ⏳ `darkMode` - Dark mode toggle (pending)
- ⏳ `objectLinkStyle` - Object link styling (pending)
- ⏳ `titlebarTextSize` - Titlebar text size (pending)
- ⏳ `titlebarIconSize` - Titlebar icon size (pending)
- ⏳ `sceneTitlePadding` - Scene title padding (pending)
- ⏳ `scenePanelHeight` - Scene panel height (pending)
- ⏳ `enableJournalDoubleClick` - Journal double-click (pending)
- ⏳ `hideRollTableIcon` - Hide roll table icons (pending)

#### RUN THE GAME GROUP - ⏳ PENDING
- ⏳ `measurementTemplate` - Measurement template (pending)
- ⏳ `tokenImageReplacementEnabled` - Token image replacement (pending)
- ⏳ `tokenNameTable` - Token name table (pending)
- ⏳ `ignoredTokens` - Ignored tokens (pending)
- ⏳ `fuzzyMatch` - Fuzzy matching (pending)
- ⏳ `nameplateStyle` - Nameplate style (pending)
- ⏳ `nameplateTextSize` - Nameplate text size (pending)
- ⏳ `nameplateTextColor` - Nameplate text color (pending)
- ⏳ `nameplateOutlineSize` - Nameplate outline size (pending)
- ⏳ `nameplateOutlineColor` - Nameplate outline color (pending)
- ⏳ `tokenLootSound` - Token loot sound (pending)
- ⏳ `movementSoundEnabled` - Movement sound enabled (pending)
- ⏳ `movementSoundPlayerTokens` - Player token sounds (pending)
- ⏳ `movementSoundMonsterTokens` - Monster token sounds (pending)
- ⏳ `movementSoundVolume` - Movement sound volume (pending)
- ⏳ `movementSoundDistanceThreshold` - Movement sound distance (pending)
- ⏳ `combatTimerEnabled` - Combat timer enabled (pending)
- ⏳ `combatTimerDuration` - Combat timer duration (pending)
- ⏳ `combatTimerEndTurn` - End turn on expiration (pending)
- ⏳ `combatTimerAutoAdvanceMessage` - Auto advance message (pending)

#### MANAGE CONTENT GROUP - ⏳ PENDING
- ⏳ `monsterCompendium1-8` - Monster compendiums (8 settings) (pending)
- ⏳ `itemCompendium1-8` - Item compendiums (8 settings) (pending)
- ⏳ `featureCompendium1-8` - Feature compendiums (8 settings) (pending)
- ⏳ `searchWorldMonstersFirst` - Search world monsters first (pending)
- ⏳ `searchWorldMonstersLast` - Search world monsters last (pending)
- ⏳ `searchWorldItemsFirst` - Search world items first (pending)
- ⏳ `searchWorldItemsLast` - Search world items last (pending)
- ⏳ `searchWorldFeaturesFirst` - Search world features first (pending)
- ⏳ `searchWorldFeaturesLast` - Search world features last (pending)

#### ROLLING AND PROGRESSION GROUP - ⏳ PENDING
- ⏳ `rollToolEnabled` - Roll tool enabled (pending)
- ⏳ `rollToolMacro` - Roll tool macro (pending)
- ⏳ `trackCombatStats` - Track combat stats (pending)
- ⏳ `trackPlayerStats` - Track player stats (pending)
- ⏳ `shareCombatStats` - Share combat stats (pending)
- ⏳ `xpDistributionEnabled` - XP distribution enabled (pending)
- ⏳ `xpDistributionMethod` - XP distribution method (pending)

#### AUTOMATION AND AI GROUP - ⏳ PENDING
- ⏳ `openAIAPIKey` - OpenAI API key (pending)
- ⏳ `openAIProjectId` - OpenAI project ID (pending)
- ⏳ `openAIModel` - OpenAI model (pending)
- ⏳ `openAIGameSystems` - Game systems (pending)
- ⏳ `openAIPrompt` - OpenAI prompt (pending)
- ⏳ `openAIContextLength` - Context length (pending)
- ⏳ `defaultPartyName` - Default party name (pending)
- ⏳ `defaultPartySize` - Default party size (pending)
- ⏳ `defaultPartyMakeup` - Default party makeup (pending)
- ⏳ `defaultPartyLevel` - Default party level (pending)
- ⏳ `defaultRulebooks` - Default rulebooks (pending)

## Complete Settings Inventory

### Headers (Presentational Only) - 36 total
1. `headingH1Blacksmith` - Main module title
2. `headingH4BlacksmithInstalled` - Installed modules status
3. `headingH4BlacksmithMissing` - Missing modules status
4. `headingH2General` - General section header
5. `headingH2Toolbar` - Toolbar section header
6. `headingH2Themes` - Themes section header
7. `headingH3simpleThemeSelections` - Theme selections subheader
8. `headingH2Windows` - Windows section header
9. `headingH3TitlebarSettings` - Titlebar subheader
10. `headingH2Journals` - Journals section header
11. `headingH3simpleJournalQOL` - Journal QOL subheader
12. `headingH3simpleEncounterSettings` - Encounter subheader
13. `headingH2CanvasTools` - Canvas tools header
14. `headingH3MeasurementTemplates` - Measurement subheader
15. `headingH2TokenImageReplacement` - Token image header
16. `headingH3TokenImageReplacement` - Token image subheader
17. `headingH3TokenSettings` - Token settings subheader
18. `headingH3TokenNaming` - Token naming subheader
19. `headingH3TokenActions` - Token actions subheader
20. `headingH3TokenMovementSounds` - Movement sounds subheader
21. `headingH2NarrativeGenerator` - Narrative generator header
22. `headingH3NarrativeGenerator` - Narrative generator subheader
23. `headingH2RollTool` - Roll tool header
24. `headingH2Compendiums` - Compendiums header
25. `headingH3MonsterCompendiums` - Monster compendiums subheader
26. `headingH3ItemCompendiums` - Item compendiums subheader
27. `headingH3FeatureCompendiums` - Feature compendiums subheader
28. `headingH2OpenAI` - OpenAI header
29. `headingH3simpleheadingH2OpenAIContext` - OpenAI context subheader
30. `headingH2Combat` - Combat header
31. `headingH2Statistics` - Statistics header
32. `headingH3SharedStats` - Shared stats subheader
33. `headingH2XP` - XP header
34. `headingH2Debug` - Debug header
35. `headingH3simpleConsole` - Console subheader
36. `headingH3simpleDebug` - Debug subheader

### Functional Settings by Workflow Group

#### GETTING STARTED GROUP
- `debugMode` - Debug mode toggle
- `latencyCheckInterval` - Latency check interval
- `globalFancyConsole` - Fancy console toggle

#### THEMES AND EXPERIENCE GROUP
- `toolbarShowDividers` - Show toolbar dividers
- `toolbarShowLabels` - Show toolbar labels
- `smoothTransition` - Smooth transitions
- `darkMode` - Dark mode toggle
- `objectLinkStyle` - Object link styling
- `titlebarTextSize` - Titlebar text size
- `titlebarIconSize` - Titlebar icon size
- `sceneTitlePadding` - Scene title padding
- `scenePanelHeight` - Scene panel height
- `enableJournalDoubleClick` - Journal double-click
- `hideRollTableIcon` - Hide roll table icons

#### RUN THE GAME GROUP
- `measurementTemplate` - Measurement template
- `tokenImageReplacementEnabled` - Token image replacement
- `tokenNameTable` - Token name table
- `ignoredTokens` - Ignored tokens
- `fuzzyMatch` - Fuzzy matching
- `nameplateStyle` - Nameplate style
- `nameplateTextSize` - Nameplate text size
- `nameplateTextColor` - Nameplate text color
- `nameplateOutlineSize` - Nameplate outline size
- `nameplateOutlineColor` - Nameplate outline color
- `tokenLootSound` - Token loot sound
- `movementSoundEnabled` - Movement sound enabled
- `movementSoundPlayerTokens` - Player token sounds
- `movementSoundMonsterTokens` - Monster token sounds
- `movementSoundVolume` - Movement sound volume
- `movementSoundDistanceThreshold` - Movement sound distance
- `combatTimerEnabled` - Combat timer enabled
- `combatTimerDuration` - Combat timer duration
- `combatTimerEndTurn` - End turn on expiration
- `combatTimerAutoAdvanceMessage` - Auto advance message

#### MANAGE CONTENT GROUP
- `monsterCompendium1-8` - Monster compendiums (8 settings)
- `itemCompendium1-8` - Item compendiums (8 settings)
- `featureCompendium1-8` - Feature compendiums (8 settings)
- `searchWorldMonstersFirst` - Search world monsters first
- `searchWorldMonstersLast` - Search world monsters last
- `searchWorldItemsFirst` - Search world items first
- `searchWorldItemsLast` - Search world items last
- `searchWorldFeaturesFirst` - Search world features first
- `searchWorldFeaturesLast` - Search world features last

#### ROLLING AND PROGRESSION GROUP
- `rollToolEnabled` - Roll tool enabled
- `rollToolMacro` - Roll tool macro
- `trackCombatStats` - Track combat stats
- `trackPlayerStats` - Track player stats
- `shareCombatStats` - Share combat stats
- `xpDistributionEnabled` - XP distribution enabled
- `xpDistributionMethod` - XP distribution method

#### AUTOMATION AND AI GROUP
- `openAIAPIKey` - OpenAI API key
- `openAIProjectId` - OpenAI project ID
- `openAIModel` - OpenAI model
- `openAIGameSystems` - Game systems
- `openAIPrompt` - OpenAI prompt
- `openAIContextLength` - Context length
- `defaultPartyName` - Default party name
- `defaultPartySize` - Default party size
- `defaultPartyMakeup` - Default party makeup
- `defaultPartyLevel` - Default party level
- `defaultRulebooks` - Default rulebooks

## CSS Compatibility

The existing CSS in `styles/common.css` targets:
- `div[data-setting-id*="coffee-pub-blacksmith.headingH1"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH2"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH3"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH4"]`

The helper function generates identical HTML structure, so all existing styling will be preserved.

## FoundryVTT Collapsible Sections

The `group` parameter enables FoundryVTT's native collapsible sections:
- Settings with the same `group` value are grouped together
- Users can click the group header to expand/collapse all settings
- Group name appears as clickable header with chevron icon
- This is native FoundryVTT functionality - no custom CSS needed

## Implementation Strategy

### Phase 1: Add Helper Functions
Add at the top of settings.js after imports:
```javascript
const WORKFLOW_GROUPS = {
    GETTING_STARTED: 'getting-started',
    THEMES_AND_EXPERIENCE: 'themes-and-experience',
    RUN_THE_GAME: 'run-the-game',
    MANAGE_CONTENT: 'manage-content',
    ROLLING_AND_PROGRESSION: 'rolling-and-progression',
    AUTOMATION_AND_AI: 'automation-and-ai'
};

function registerHeader(id, labelKey, hintKey, level = 'H2', group = null) {
    game.settings.register(MODULE.ID, `heading${level}${id}`, {
        name: MODULE.ID + `.${labelKey}`,
        hint: MODULE.ID + `.${hintKey}`,
        scope: "world",
        config: true,
        default: "",
        type: String,
        group: group
    });
}
```

### Phase 2: Proof of Concept - Getting Started
Replace the existing Getting Started section with:
```javascript
// *** GETTING STARTED ***
registerHeader('GettingStarted', 'headingH2GettingStarted-Label', 'headingH2GettingStarted-Hint', 'H2', WORKFLOW_GROUPS.GETTING_STARTED);

game.settings.register(MODULE.ID, 'debugMode', {
    name: MODULE.ID + '.debugMode-Label',
    hint: MODULE.ID + '.debugMode-Hint',
    type: Boolean,
    config: true,
    requiresReload: true,
    scope: 'world',
    default: true,
    group: WORKFLOW_GROUPS.GETTING_STARTED  // Add this line
});

game.settings.register(MODULE.ID, 'latencyCheckInterval', {
    name: MODULE.ID + '.latencyCheckInterval-Label',
    hint: MODULE.ID + '.latencyCheckInterval-Hint',
    type: Number,
    scope: 'world',
    config: true,
    range: {
        min: 5,
        max: 300,
        step: 5
    },
    default: 30,
    group: WORKFLOW_GROUPS.GETTING_STARTED  // Add this line
});

game.settings.register(MODULE.ID, 'globalFancyConsole', {
    name: MODULE.ID + '.globalFancyConsole-Label',
    hint: MODULE.ID + '.globalFancyConsole-Hint',
    type: Boolean,
    config: true,
    requiresReload: true,
    scope: 'client',
    default: true,
    group: WORKFLOW_GROUPS.GETTING_STARTED  // Add this line
});
```

### Phase 3: Migrate Remaining Sections
Apply the same pattern to all other sections:
1. Replace header registration with `registerHeader()` call
2. Add `group: WORKFLOW_GROUPS.[GROUP_NAME]` to all settings in that section
3. Test each section individually

## Critical Requirements

### DO NOT CHANGE:
- [ ] Setting names/IDs
- [ ] Setting values/defaults
- [ ] CSS files
- [ ] Other JavaScript files
- [ ] Functionality

### DO ADD:
- [ ] Helper functions
- [ ] Workflow group constants
- [ ] `group` parameter to all settings
- [ ] Collapsible section functionality

## Migration Checklist

### Implementation Steps:
1. [x] Add helper functions at top of file
2. [x] Define workflow group constants
3. [x] Replace Getting Started section (proof of concept)
4. [x] Test collapsible sections work
5. [x] Verify styling unchanged
6. [x] Migrate Themes and Experience section
7. [x] Migrate Run the Game section (partial - Toolbar, Chat, Menubar)
8. [ ] Migrate Manage Content section
9. [ ] Migrate Rolling and Progression section
10. [ ] Migrate Automation and AI section
11. [ ] Final testing and validation

### Testing Requirements:
- [ ] All settings still work correctly
- [ ] Group collapsing/expanding functions
- [ ] Settings save/load properly
- [ ] No breaking changes to existing functionality
- [ ] Visual styling preserved
- [ ] Collapsible sections work as expected

## Benefits

### Immediate Benefits:
- **Reduced code verbosity** - 70% less code for headers
- **Collapsible sections** - Users can expand/collapse workflow groups
- **Better organization** - Settings grouped by user intent
- **Easier maintenance** - Clear structure for adding new settings

### Preserved Benefits:
- **All existing styling** - CSS continues to work exactly as before
- **Localization support** - Same label/hint structure maintained
- **Visual hierarchy** - H1/H2/H3/H4 styling preserved
- **Dynamic content** - Status messages and module info still work

### Future-Proofing:
- **Easy migration to v13+** - Structure ready for ApplicationV2
- **Scalable organization** - Easy to add new workflow groups
- **Consistent patterns** - Standardized approach for all settings

## Notes

- This is a **FOCUSED refactor** - only settings.js changes
- No other files need modification
- All existing functionality preserved
- CSS styling completely compatible
- Ready for FoundryVTT v12+ collapsible sections

## Migration Status

### ✅ COMPLETED SECTIONS:

#### 1. Getting Started (3/3 settings) - COMPLETE
- **Headers:** H1 Getting Started, H2 General, H2 Debug, H3 Console, H3 Latency
- **Settings:** globalFancyConsole, latencyCheckInterval
- **Status:** All migrated to `WORKFLOW_GROUPS.GETTING_STARTED`
- **Helper Functions:** All headers use `registerHeader()` helper
- **Group Parameter:** All settings have `group: WORKFLOW_GROUPS.GETTING_STARTED`

#### 2. Themes and Experience (18/18 settings) - COMPLETE
- **Headers:** H2 Themes, H3 Theme Selections, H3 Theme Default, H3 CSS Customization, H3 Debug Settings
- **Settings:** All theme selection settings, defaultCardTheme, customCSS, cssTransition, cssDarkMode, globalDebugMode, globalConsoleDebugStyle
- **Status:** All migrated to `WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE`
- **Helper Functions:** All headers use `registerHeader()` helper
- **Group Parameter:** All settings have `group: WORKFLOW_GROUPS.THEMES_AND_EXPERIENCE`

#### 3. Run the Game (5/5 settings migrated so far) - PARTIAL
- **Headers:** H2 Toolbar, H2 Chat, H3 Menubar
- **Settings:** toolbarShowDividers, toolbarShowLabels, enableMenubar, excludedUsersMenubar
- **Status:** Migrated to `WORKFLOW_GROUPS.RUN_THE_GAME`
- **Helper Functions:** All headers use `registerHeader()` helper
- **Group Parameter:** All settings have `group: WORKFLOW_GROUPS.RUN_THE_GAME`

### ⏳ PENDING SECTIONS:

#### 4. Manage Content - NOT STARTED
- Token settings
- Image replacement settings
- Content management tools

#### 5. Rolling and Progression - NOT STARTED
- Roll settings
- XP settings
- Progression tools

#### 6. Automation and AI - NOT STARTED
- AI integration settings
- Automation tools
- Smart features

### 📊 OVERALL PROGRESS:
- **Total Settings Migrated:** 34/100+ (estimated)
- **Workflow Groups Complete:** 2/6 (Getting Started, Themes and Experience)
- **Workflow Groups Partial:** 1/6 (Run the Game)
- **Workflow Groups Pending:** 3/6 (Manage Content, Rolling and Progression, Automation and AI)
