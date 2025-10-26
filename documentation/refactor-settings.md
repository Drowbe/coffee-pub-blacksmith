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
- ✅ `headingH4Introduction` - Introduction header (migrated)
- ✅ `headingH2CoffeePubSuite` - Coffee Pub Suite header (migrated)
- ✅ `headingH4BlacksmithInstalled` - Installed modules status (migrated)
- ✅ `headingH4BlacksmithMissing` - Missing modules status (migrated)
- ✅ `headingH2DefaultPartySettings` - Default party settings header (migrated)
- ✅ `defaultPartyName` - Default party name (migrated)
- ✅ `defaultPartySize` - Default party size (migrated)
- ✅ `defaultPartyMakeup` - Default party makeup (migrated)
- ✅ `defaultPartyLevel` - Default party level (migrated)
- ✅ `defaultRulebooks` - Default rulebooks (migrated)
- ✅ `partyLeader` - Party leader (hidden setting) (migrated)

#### LAYOUT AND EXPERIENCE GROUP - ✅ COMPLETE
- ✅ `headingH1LayoutAndExperience` - Main section header (migrated)
- ✅ `headingH2Themes` - Themes section header (migrated)
- ✅ `headingH3simpleThemeSelections` - Theme selections subheader (migrated)
- ✅ All theme enable/disable settings (dynamic) (migrated)
- ✅ `headingH3simpleThemeDefault` - Theme default subheader (migrated)
- ✅ `defaultCardTheme` - Default card theme setting (migrated)
- ✅ `headingH2FoundryEnhancements` - Foundry enhancements section header (migrated)
- ✅ `headingH3QualityOfLife` - Quality of life subheader (migrated)
- ✅ `headingH1RunTheGame` - Main section header (migrated)
- ✅ `headingH3simplemenubar` - Menubar subheader (migrated)
- ✅ `enableMenubar` - Enable menubar (migrated)
- ✅ `excludedUsersMenubar` - Excluded users menubar (migrated)
- ✅ `enableJournalDoubleClick` - Journal double-click (migrated)
- ✅ `objectLinkStyle` - Object link styling (migrated)
- ✅ `hideRollTableIcon` - Hide roll table icons (migrated)
- ✅ `headingH3Toolbar` - Toolbar subheader (migrated)
- ✅ `toolbarShowDividers` - Show toolbar dividers (migrated)
- ✅ `toolbarShowLabels` - Show toolbar labels (migrated)
- ✅ `headingH3Scenes` - Scenes subheader (migrated)
- ✅ `enableSceneInteractions` - Enable scene interactions (migrated)
- ✅ `enableSceneClickBehaviors` - Enable scene click behaviors (migrated)
- ✅ `scenePanelHeight` - Scene panel height (migrated)
- ✅ `sceneTitlePadding` - Scene title padding (migrated)
- ✅ `sceneTextAlign` - Scene text alignment (migrated)
- ✅ `sceneFontSize` - Scene font size (migrated)
- ✅ `headingH3CardAdjustments` - Chat adjustments subheader (migrated)
- ✅ `chatSpacing` - Chat spacing (migrated)
- ✅ `cardTopMargin` - Card top margin (migrated)
- ✅ `cardBottomMargin` - Card bottom margin (migrated)
- ✅ `cardLeftMargin` - Card left margin (migrated)
- ✅ `cardRightMargin` - Card right margin (migrated)
- ✅ `cardTopOffset` - Card top offset (migrated)
- ✅ `headingH3Windows` - Windows subheader (migrated)
- ✅ `titlebarTextSize` - Titlebar text size (migrated)
- ✅ `titlebarIconSize` - Titlebar icon size (migrated)
- ✅ `titlebarSpacing` - Titlebar spacing (migrated)
-  Canvas Tools Settings
- ✅ `canvasToolsHideLeftUI` - Hide left UI
- ✅ `canvasToolsHideBottomUI` - Hide bottom UI

#### RUN THE GAME GROUP - ✅ PARTIAL


- Combat Tracker Settings
- ⏳ `combatTrackerSetCurrentCombatant` - Set current combatant
- ⏳ `combatTrackerClearInitiative` - Clear initiative
- ⏳ `combatTrackerSetFirstTurn` - Set first turn
- ⏳ `combatTrackerRollInitiativeNonPlayer` - Roll initiative non-player
- ⏳ `combatTrackerRollInitiativePlayer` - Roll initiative player
- ⏳ `combatTrackerAddInitiative` - Add initiative
- ⏳ `combatTrackerOpen` - Combat tracker open
- ⏳ `combatTrackerResizable` - Combat tracker resizable
- ⏳ `combatTrackerSize` - Combat tracker size
- ⏳ `combatTrackerShowHealthBar` - Show health bar
- ⏳ `combatTrackerShowPortraits` - Show portraits







#### MANAGE CONTENT GROUP - ✅ HEADER ONLY
- ✅ `headingH1ManageContent` - Main section header (migrated)

#### ROLLING AND PROGRESSION GROUP - ✅ COMPLETE
- ✅ `headingH1RollingAndProgression` - Main section header (migrated)
- ✅ `headingH2diceRollTool` - Roll system header (migrated)
- ✅ `diceRollToolSystem` - Chat roll system choice (migrated)
- ✅ `headingH3diceRollToolIntegrations` - Roll tool integrations header (migrated)
- ✅ `diceRollToolEnableDiceSoNice` - Enable Dice So Nice integration (migrated)
- ✅ `skillCheckPreferences` - Skill check preferences (hidden setting) (migrated)
- ✅ `headingH2XpDistribution` - XP distribution header (migrated)
- ✅ `enableXpDistribution` - Enable XP distribution (migrated)
- ✅ `autoDistributeXp` - Auto-distribute XP (migrated)
- ✅ `shareXpResults` - Share XP results (migrated)
- ✅ `xpCalculationMethod` - XP calculation method (migrated)
- ✅ `xpPartySizeHandling` - Party size handling (migrated)
- ✅ `xpMultiplierDefeated` - Defeated XP multiplier (migrated)
- ✅ `xpMultiplierNegotiated` - Negotiated XP multiplier (migrated)
- ✅ `xpMultiplierEscaped` - Escaped XP multiplier (migrated)
- ✅ `xpMultiplierIgnored` - Ignored XP multiplier (migrated)
- ✅ `xpMultiplierCaptured` - Captured XP multiplier (migrated)

#### AUTOMATION GROUP - ✅ HEADER ONLY
- ✅ `headingH1Automation` - Main section header (migrated)

- ✅ Movement Settings
- ✅ `movementFollowDistanceThreshold` - "Too Far" tiles
- ✅ `tokenSpacing` - Token spacing
- ✅ `movementType` - Current movement type (hidden setting)
- ✅ `movementSoundsEnabled` - Movement sounds enabled
- ✅ `movementSoundPlayer` - Movement sound player
- ✅ `movementSoundMonster` - Movement sound monster
- ✅ `movementSoundVolume` - Movement sound volume
- ✅ `movementSoundDistanceThreshold` - Movement sound distance threshold

- ✅ Token Nameplate Settings
- ✅ `nameplateStyle` - Nameplate style
- ✅ `nameplateTextSize` - Nameplate text size
- ✅ `nameplateTextColor` - Nameplate text color
- ✅ `nameplateOutlineSize` - Nameplate outline size
- ✅ `nameplateOutlineColor` - Nameplate outline color

- Token Image Replacement Settings
- ⏳ `tokenImageReplacementEnabled` - Token image replacement enabled
- ⏳ `tokenImageReplacementDisplayCacheStatus` - Cache status display
- ⏳ `tokenNameTable` - Token name table
- ⏳ `ignoredTokens` - Ignored tokens
- ⏳ `fuzzyMatch` - Fuzzy matching






#### ARTIFICIAL INTELLIGENCE GROUP - ✅ COMPLETE
- ✅ `headingH1ArtificialIntelligence` - Main section header (migrated)
- ✅ `headingH3simpleheadingH2OpenAICore` - OpenAI core header (migrated)
- ✅ `openAIMacro` - OpenAI macro (migrated)
- ✅ `openAIAPIKey` - OpenAI API key (migrated)
- ✅ `openAIProjectId` - OpenAI project ID (migrated)
- ✅ `openAIModel` - OpenAI model (migrated)
- ✅ `headingH3simpleheadingH2OpenAIContext` - OpenAI context header (migrated)
- ✅ `openAIGameSystems` - Game systems (migrated)
- ✅ `openAIPrompt` - OpenAI prompt (migrated)
- ✅ `openAIContextLength` - Context length (migrated)
- ✅ `openAITemperature` - Temperature (migrated)

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

### ⏳ UNCATEGORIZED SETTINGS (Below Temporary Divider)

These settings are still using the old organization and need to be categorized into workflow groups:

MAYBE THE TIMERS GO IN THE CAMPAING MANAGEMENT AREA?

#### Session/Timer Settings
- ⏳ `sessionEndTime` - Session end time (hidden setting)
- ⏳ `sessionStartTime` - Session start time (hidden setting)  
- ⏳ `sessionTimerDate` - Session timer date (hidden setting)
- ⏳ `sessionTimerDefault` - Default session time
- ⏳ `sessionTimerWarningThreshold` - Session timer warning time
- ⏳ `sessionTimerWarningSound` - Session timer warning sound
- ⏳ `sessionTimerWarningMessage` - Session timer warning message
- ⏳ `sessionTimerExpiredSound` - Session timer expired sound
- ⏳ `sessionTimerExpiredMessage` - Session timer expired message

#### Combat/Timer Settings
- ⏳ `combatTimerEnabled` - Combat timer enabled
- ⏳ `combatTimerAutoStart` - Auto start timer
- ⏳ `combatTimerActivityStart` - Activity starts timer
- ⏳ `combatTimerDuration` - Combat timer duration
- ⏳ `combatTimerStartSound` - Timer start sound
- ⏳ `combatTimerWarningThreshold` - Combat timer warning threshold
- ⏳ `combatTimerWarningMessage` - Combat timer warning message
- ⏳ `combatTimerWarningSound` - Combat timer warning sound
- ⏳ `combatTimerCriticalThreshold` - Combat timer critical threshold
- ⏳ `combatTimerCriticalMessage` - Combat timer critical message
- ⏳ `combatTimerCriticalSound` - Combat timer critical sound
- ⏳ `combatTimerExpiredMessage` - Combat timer expired message
- ⏳ `combatTimerEndTurn` - End turn on expiration
- ⏳ `combatTimerAutoAdvanceMessage` - Auto advance message
- ⏳ `combatTimerGMOnly` - GM-only timers
- ⏳ `showTimerNotifications` - Show timer notifications
- ⏳ `timerPauseResumeSound` - Timer pause/resume sound
- ⏳ `timerSoundVolume` - Timer sound volume

#### Round Timer Settings
- ⏳ `showRoundTimer` - Show round timer

#### Planning Timer Settings
- ⏳ `planningTimerEnabled` - Enable planning timer
- ⏳ `planningTimerAutoStart` - Auto-start planning timer
- ⏳ `planningTimerLabel` - Planning timer label
- ⏳ `planningTimerDuration` - Planning timer duration
- ⏳ `planningTimerEndingSoonThreshold` - Planning timer ending soon threshold
- ⏳ `planningTimerEndingSoonMessage` - Planning timer ending soon message
- ⏳ `planningTimerEndingSoonSound` - Planning timer ending soon sound
- ⏳ `planningTimerExpiredMessage` - Planning timer expired message
- ⏳ `planningTimerExpiredSound` - Planning timer expired sound








#### Sound Settings

- ⏳ `tokenLootSound` - Token loot sound
- ⏳ `tokenLootPileImage` - Loot token image path
- ⏳ `tokenLootTableTreasure` - Treasure loot table

#### Token Death/Status Settings
- ⏳ `deadTokenSoundDeath` - Death sound
- ⏳ `deadTokenSoundUnconscious` - Unconscious sound
- ⏳ `deadTokenSoundStable` - Stable PC sound
- ⏳ `tokenConvertDeadToLoot` - Convert dead to loot
- ⏳ `tokenConvertDelay` - Loot delay

#### Turn Indicator Settings
- ⏳ `turnIndicatorEnabled` - Turn indicator enabled
- ⏳ `turnIndicatorColor` - Turn indicator color
- ⏳ `turnIndicatorThickness` - Turn indicator thickness
- ⏳ `turnIndicatorOffset` - Turn indicator distance
- ⏳ `turnIndicatorOpacityMin` - Turn indicator min opacity
- ⏳ `turnIndicatorOpacityMax` - Turn indicator max opacity
- ⏳ `turnIndicatorInnerOpacity` - Turn indicator inner fill opacity

#### Encounter Settings
- ⏳ `enableJournalEncounterToolbar` - Enable encounter toolbar
- ⏳ `encounterFolder` - Encounter folder
- ⏳ `encounterToolbarDeploymentHidden` - Deployment hidden
- ⏳ `encounterToolbarDeploymentPattern` - Deployment pattern
- ⏳ `enableEncounterContentScanning` - Content scanning
- ⏳ `enableJournalEncounterToolbarRealTimeUpdates` - Real-time updates

#### Journal Settings
- ⏳ `enableJournalTools` - Enable journal tools

#### Campaign Settings
- ⏳ `defaultNarrativeFolder` - Default narrative folder
- ⏳ `defaultJournalPageTitle` - Default journal page title
- ⏳ `defaultJournalPageContent` - Default journal page content
- ⏳ `defaultJournalPageImage` - Default journal page image
- ⏳ `defaultJournalPageImagePosition` - Default journal page image position

#### Compendium Search Settings
- ⏳ `searchWorldMonstersFirst` - Search world monsters first
- ⏳ `searchWorldMonstersLast` - Search world monsters last
- ⏳ `monsterCompendium1-8` - Monster compendiums (8 settings)
- ⏳ `searchWorldItemsFirst` - Search world items first
- ⏳ `searchWorldItemsLast` - Search world items last
- ⏳ `itemCompendium1-8` - Item compendiums (8 settings)
- ⏳ `searchWorldFeaturesFirst` - Search world features first
- ⏳ `searchWorldFeaturesLast` - Search world features last
- ⏳ `featureCompendium1-8` - Feature compendiums (8 settings)

#### Statistics Settings
- ⏳ `trackCombatStats` - Track combat stats
- ⏳ `trackPlayerStats` - Track player stats
- ⏳ `shareCombatStats` - Share combat stats
- ⏳ `showNotableMoments` - Show notable moments

#### Visual Divider Settings
- ⏳ `headingHR` - Visual divider setting















#### Header Settings (Old Organization)
- ⏳ `headingH3simpleEncounterSettings` - Automated encounter settings header
- ⏳ `headingH2Canvas` - Canvas header
- ⏳ `headingH3CanvasTools` - Canvas tools header
- ⏳ `headingH3Movement` - Movement header
- ⏳ `headingH2Tokens` - Tokens header
- ⏳ `headingH3Nameplate` - Nameplate header
- ⏳ `headingH3TokenSettings` - Token settings header
- ⏳ `headingH3TokenImageReplacement` - Token image replacement header
- ⏳ `headingH4tokenImageReplacementCacheStats` - Cache stats header
- ⏳ `headingH3TokenActions` - Token actions header
- ⏳ `headingH2CampaignSettings` - Campaign settings header
- ⏳ `headingH3CampaignCommon` - Campaign common header
- ⏳ `headingH3NarrativeGenerator` - Narrative generator header
- ⏳ `headingH3EncounterDefaults` - Encounter defaults header
- ⏳ `headingH3ItemImport` - Item import header
- ⏳ `headingH2CompendiumMapping` - Compendium mapping header
- ⏳ `headingH3ActorCompendiums` - Actor compendiums header
- ⏳ `headingH3ItemCompendiums` - Item compendiums header
- ⏳ `headingH3FeatureCompendiums` - Feature compendiums header
- ⏳ `headingH3SpellCompendiums` - Spell compendiums header
- ⏳ `headingH2RoundAnnouncments` - Round announcements header
- ⏳ `headingH2CombatTracker` - Combat tracker header
- ⏳ `headingH2Timers` - Timers header
- ⏳ `headingH3simpleGlobalTimer` - Global timer header
- ⏳ `headingH3simpleGlobalTimerMessaging` - Global timer messaging header
- ⏳ `headingH3RoundTimer` - Round timer header
- ⏳ `headingH3PlanningTimer` - Planning timer header
- ⏳ `headingH3CombatTimer` - Combat timer header
- ⏳ `headingH2Statistics` - Statistics header
- ⏳ `headingH3SharedStats` - Shared stats header
- ⏳ `headingH3RoundStats` - Round stats header
- ⏳ `headingH3CombatStats` - Combat stats header
- ⏳ `headingH2MovementSounds` - Movement sounds header

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
