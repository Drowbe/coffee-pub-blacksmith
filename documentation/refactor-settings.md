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
- ✅ `headingH1GettingStarted` - Main module title (migrated)
- ✅ `headingH2CoffeePubSuite` - Coffee Pub Suite header (migrated)
- ✅ `headingH4BlacksmithInstalled` - Installed modules status (migrated)
- ✅ `headingH4BlacksmithMissing` - Missing modules status (migrated)
- ✅ `headingH2General` - General section header (migrated)
- ✅ `headingH2DefaultPartySettings` - Default party settings header (migrated)
- ✅ `defaultPartyName` - Default party name (migrated)
- ✅ `defaultPartySize` - Default party size (migrated)
- ✅ `defaultPartyMakeup` - Default party makeup (migrated)
- ✅ `defaultPartyLevel` - Default party level (migrated)
- ✅ `defaultRulebooks` - Default rulebooks (migrated)

#### LAYOUT AND EXPERIENCE GROUP - ✅ COMPLETE
- ✅ `headingH1LayoutAndExperience` - Main section header (migrated)
- ✅ `headingH2Themes` - Themes section header (migrated)
- ✅ `headingH3simpleThemeSelections` - Theme selections subheader (migrated)
- ✅ `headingH3simpleThemeDefault` - Theme default subheader (migrated)
- ✅ `defaultCardTheme` - Default card theme setting (migrated)
- ✅ `headingH2FoundryEnhancements` - Foundry enhancements section header (migrated)
- ✅ `headingH3QualityOfLife` - Quality of life subheader (migrated)
- ✅ `enableJournalDoubleClick` - Journal double-click (migrated)
- ✅ `objectLinkStyle` - Object link styling (migrated)
- ✅ `hideRollTableIcon` - Hide roll table icons (migrated)
- ✅ `headingH3Toolbar` - Toolbar subheader (migrated)
- ✅ `toolbarShowDividers` - Show toolbar dividers (migrated)
- ✅ `toolbarShowLabels` - Show toolbar labels (migrated)
- ✅ `headingH3Windows` - Windows subheader (migrated)
- ✅ `titlebarTextSize` - Titlebar text size (migrated)
- ✅ `titlebarIconSize` - Titlebar icon size (migrated)
- ✅ `headingH3Scenes` - Scenes subheader (migrated)
- ✅ `sceneTitlePadding` - Scene title padding (migrated)
- ✅ `scenePanelHeight` - Scene panel height (migrated)

#### RUN THE GAME GROUP - ✅ PARTIAL
- ✅ `headingH1RunTheGame` - Main section header (migrated)
- ✅ `headingH2Toolbar` - Toolbar section header (migrated)
- ✅ `toolbarShowDividers` - Show toolbar dividers (migrated)
- ✅ `toolbarShowLabels` - Show toolbar labels (migrated)
- ✅ `headingH3simplemenubar` - Menubar subheader (migrated)
- ✅ `enableMenubar` - Enable menubar (migrated)
- ✅ `excludedUsersMenubar` - Excluded users menubar (migrated)
- ✅ `headingH2Chat` - Chat section header (migrated)
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

- ADD AN H3simple FOR "Monsters"
- ⏳ `searchWorldMonstersFirst` - Search world monsters first (pending)
- ⏳ `searchWorldMonstersLast` - Search world monsters last (pending)
- ⏳ `monsterCompendium1-8` - Monster compendiums (8 settings) (pending)

- ADD AN H3simple FOR "Items"
- ⏳ `searchWorldItemsFirst` - Search world items first (pending)
- ⏳ `searchWorldItemsLast` - Search world items last (pending)
- ⏳ `itemCompendium1-8` - Item compendiums (8 settings) (pending)

- ADD AN H3simple FOR "Features"
- ⏳ `featureCompendium1-8` - Feature compendiums (8 settings) (pending)
- ⏳ `searchWorldFeaturesFirst` - Search world features first (pending)
- ⏳ `searchWorldFeaturesLast` - Search world features last (pending)


#### ROLLING AND PROGRESSION GROUP - ✅ HEADER ONLY
- ✅ `headingH1RollingAndProgression` - Main section header (migrated)
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


#### DEVELOPER TOOLS GROUP - ✅ COMPLETE
- ✅ `headingH1DeveloperTools` - Main section header (migrated)
- ✅ `headingH2CSS` - CSS customization header (migrated)
- ✅ `customCSS` - Custom CSS storage (migrated)
- ✅ `cssTransition` - Smooth transitions (migrated)
- ✅ `cssDarkMode` - Dark mode toggle (migrated)
- ✅ `headingH2PerformanceTools` - Performance tools header (migrated)
- ✅ `headingH3PerformanceMenubarOptions` - Menubar subheader (migrated)
- ✅ `showPerformanceMonitorInMenubar` - Show performance monitor (migrated)
- ✅ `showRefreshInMenubar` - Show refresh button (migrated)
- ✅ `showSettingsInMenubar` - Show settings button (migrated)
- ✅ `headingH3Latency` - System latency subheader (migrated)
- ✅ `enableLatency` - Enable system latency checks (migrated)
- ✅ `latencyCheckInterval` - Latency check interval (migrated)
- ✅ `headingH2ConsoleSettings` - Console log setting header (migrated)
- ✅ `headingH3simpleConsole` - Console settings subheader (migrated)
- ✅ `globalFancyConsole` - Fancy console toggle (migrated)
- ✅ `headingH3simpleDebug` - Debug settings subheader (migrated)
- ✅ `globalDebugMode` - Debug mode toggle (migrated)
- ✅ `globalConsoleDebugStyle` - Console debug style (migrated)






## CSS Compatibility

The existing CSS in `styles/common.css` targets:
- `div[data-setting-id*="coffee-pub-blacksmith.headingH1"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH2"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH3"]`
- `div[data-setting-id*="coffee-pub-blacksmith.headingH3simple"]`
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
