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
