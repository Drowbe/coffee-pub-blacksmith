# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.0.12]

### Added
- **MVP Tuning Settings (Round + Combat MVP)**:
  - New GM-configurable sliders for MVP scoring weights: Hits, Misses, Crits, Fumbles, Damage (per 10), Healing (per 10)
  - New checkbox to **Normalize MVP scoring by party max** (default: enabled) to reduce "big number" bias and make weights more comparable across party levels/roles
- **Player Manual Rolls Control**: Added `sidebarManualRollsPlayersEnabled` world setting (GM-only) to control whether players can see the manual rolls toggle button in the sidebar. Players must have both `sidebarManualRollsEnabled` (user) and `sidebarManualRollsPlayersEnabled` (world) enabled to see the button.

### Changed
- **MVP Scoring Formula**: MVP scoring is now driven by the new settings (including optional normalization) and is applied consistently for both Round MVP and Combat MVP.
- **Manual Rolls Toggle**: Converted manual rolls toggle to pure client-only operation. Players now toggle their own `core.diceConfiguration` setting directly without requiring socket communication to the GM. GM receives a whisper notification when players toggle manual rolls.
- **Settings Scope Migration**: Migrated 28 user preference settings from `scope: "client"` to `scope: "user"` to ensure user preferences persist across devices. Settings now follow users when they log in from different browsers or devices within the same world. This includes UI preferences (sidebar, toolbar, titlebar, canvas tools, combat tracker display), behavior preferences (auto-roll initiative, clear targets, manual rolls), audio preferences (timer sound volume), and developer preferences (debug mode, console style). Window state settings (combat tracker size, token image replacement window state, chat+combat split) remain `scope: "client"` as they are device-specific.
- **registerHeader Function**: Enhanced `registerHeader` helper function to accept optional `scope` parameter (defaults to `"world"`). All `registerHeader` calls now explicitly specify scope, with user preference sections using `"user"` scope and world-wide configuration sections using `"world"` scope.
- **Hide Default Target Indicators**: Changed `hideDefaultTargetIndicators` setting from `scope: "user"` to `scope: "world"` with default value changed from `false` to `true`. This ensures consistent target indicator behavior across all users in the world.
- **Round Summary Accuracy Display**: Changed accuracy detail in round summary cards to show "X of Y" format (e.g., "3 of 7") instead of "X hits Y misses" for better readability. Misses information remains available in the tooltip.

### Fixed
- **Manual Rolls Toggle for Players**: Fixed critical issue where players could not toggle manual rolls via the sidebar button. The toggle now works immediately for players without requiring them to open Foundry's Dice Configuration settings first. The system now automatically initializes dice configuration with proper dice keys when empty, ensuring toggles work on first use.
- **Manual Rolls Button State**: Fixed button color/active state not updating for players after toggling. Button now correctly reflects the current manual rolls state by re-reading the dice configuration after applying changes.
- **Latency Socket Errors**: Fixed "Unknown message type" errors appearing in player client consoles for latency checker ping/pong messages. Socket handlers now correctly extract payload from nested SocketLib message structures, and the latency checker silently ignores ping/pong messages not intended for the current user (since `executeForOthers` broadcasts to all clients but only the target should process them).

## [13.0.11]

### Added
- **Loading Progress Indicator**: Comprehensive loading progress system for FoundryVTT world loading
  - Full-screen overlay showing overall FoundryVTT loading progress (not just module initialization)
  - Tracks 5 major loading phases: Modules → Systems → Game Data → Canvas → Finalizing
  - Live activity feed displaying current loading activity with spinning icon
  - Activity history showing recent loading activities with fade-out effect
  - Progress bar with percentage display and smooth animations
  - Close button (X) to dismiss indicator and let FoundryVTT continue loading normally
  - Respects `coreLoadingProgress` setting to enable/disable the indicator
  - Background image matching module window style (background-skull-red.webp)
  - Red color scheme matching module theme for progress bar and accents
  - Font Awesome spinner icon for activity indicator
  - Automatic detection of FoundryVTT loading phases via polling
  - Manual activity logging during Blacksmith initialization steps
  - Safe setting check with fallback (defaults to showing if setting unavailable during early init)
- **Chat + Combat Sidebar Tab**: New hybrid sidebar tab combining chat log and combat tracker
  - New tab button appears after the existing Combat button in the sidebar
  - Chat log displayed at top (read-only, no input or controls)
  - Combat tracker displayed at bottom
  - Draggable divider between panes for custom sizing (default 50/50 split)
  - Split ratio persisted per user via client setting (`chatCombatSplit`)
  - Respects `sidebarCombatChatEnabled` setting to show/hide the tab
  - Chat log auto-scrolls to latest messages when content is added
  - Preserves core chat tab functionality by cloning chat log instead of moving it
  - Maintains Foundry's native combat tracker styling by moving entire combat section
- **Healing Tracking System**: Implemented comprehensive healing tracking for player lifetime stats
  - **HP Delta Tracking (Lane 1)**: Source of truth for applied healing - tracks actual HP changes via `preUpdateActor`/`updateActor` hooks
  - **Chat Message Attribution**: Detects healing spells in chat messages using reliable `activity.type === "heal"` signal for caster attribution
  - **MIDI Workflow Support**: Processes healing via `midi-qol.preTargetDamageApplication` hook for accurate per-target healing attribution when using Midi-QOL module
  - **Healing Received**: Tracks `lifetime.healing.received` on target actors when HP increases
  - **Healing Given**: Tracks `lifetime.healing.given` and `lifetime.healing.total` on caster actors
  - **Revive Tracking**: Increments `lifetime.revives.received` when HP goes from 0 to >0
  - **By-Target Tracking**: Maintains `lifetime.healing.byTarget` object with healing amounts per target
  - **Most/Least Healed**: Tracks `mostHealed` and `leastHealed` based on byTarget totals
  - **Human-Readable Logging**: Added detailed console logging for healing data collection (using `postConsoleAndNotification` with "Player Stats | " prefix)
- **Unconscious Tracking System**: Implemented comprehensive unconscious event tracking for player lifetime stats
  - **HP Delta Source of Truth**: Tracks unconscious events when HP drops from >0 to ≤0 via `updateActor` hooks
  - **Queue-Based Attribution**: Stores damage context in per-target queues (last 10 entries) for accurate attribution in multi-hit scenarios
  - **Combat-Aware Matching**: Scores damage contexts by combat round/turn, recency, and damage amount to select best match
  - **Unconscious Log**: Maintains detailed log of unconscious events with date, scene, attacker, weapon, and damage amount
  - **Count Tracking**: Tracks total unconscious count in `lifetime.unconscious.count`
  - **Attribution System**: Captures attacker name, weapon/source name, and damage amount when available from damage messages
- **Refactored Hit/Miss/Damage Tracking**: Complete overhaul of attack and damage resolution system
  - **Message Resolution Pipeline**: New `utility-message-resolution.js` with shared functions for parsing chat messages
  - **Stable Identifiers**: Uses `speaker.actor`, `flags.dnd5e.item.uuid`, `flags.dnd5e.activity.uuid`, and sorted target UUIDs for correlation (replaces unstable `originatingMessage`)
  - **Accurate Hit/Miss Detection**: Determines hit/miss from attack messages using `attackTotal >= target.ac` instead of inferring from damage rolls
  - **Damage Classification**: Classifies damage as "onHit" or "other" based on attack outcome, not damage presence
  - **Attack Cache System**: Implements TTL-based cache (15 seconds) with deduplication for multi-damage workflows
  - **Separate Stats Model**: Records `attacks.hit`, `attacks.miss`, `damage.rolled.onHit`, `damage.rolled.other` separately for accuracy
- **Crit/Fumble Detection Improvements**: Enhanced critical hit and fumble detection
  - **Active Result Detection**: Now uses the active d20 result (for advantage/disadvantage) instead of first result
  - **Multiple d20 Support**: Handles rolls with multiple d20 terms correctly
  - **Debug Logging**: Added diagnostic logging for crit/fumble detection verification
- **Actor Update Queue System**: Implemented per-actor serialization queue to prevent race conditions in stat updates
  - **Sequential Update Guarantee**: Ensures all stat updates for the same actor happen sequentially, not concurrently
  - **Promise-Based Queueing**: Uses promise chaining to serialize writes and prevent concurrent read-modify-write cycles
  - **Automatic Cleanup**: Queue entries are automatically cleaned up when no longer needed
  - **Healing Race Condition Fix**: Prevents healing totals from being overwritten in multi-target healing scenarios (e.g., Mass Cure Wounds)
- **Combat/Round Stats Reliability (Core + Midi-QOL)**: Brought combat/round tracking in line with the multi-lane player-stats architecture
  - **MIDI Lanes**: Use Midi-QOL workflow hooks for authoritative combat events
    - `midi-qol.hitsChecked` for hit/miss resolution
    - `midi-qol.preTargetDamageApplication` for damage + healing (per-target amounts)
    - `midi-qol.RollComplete` for crit/fumble (stamped onto cached attacks)
  - **Core Lane Safety**: Chat-message lane remains as a fallback when Midi-QOL is not authoritative
    - Added `updateChatMessage` handling (rolls/flags-only) so core messages that receive roll data after creation are still processed
  - **Damage/Healing Policy Alignment**:
    - Combat totals now include all damage/healing, including `bucket: "other"` and `"unlinked"` (AoE/save/non-attack and correlation misses)
    - “Top hits / Biggest hit / Weakest hit” moments remain **onHit-only**
  - **Target Attribution Improvements**: Damage processing prefers `damageEvent.targetUuids` when present, with best-effort fallbacks
  - **Combat Summary Totals**: Party-wide totals are computed from **player characters only** (participants may include NPCs for context/moments)

### Changed
- **Healing Detection Logic**: Simplified healing detection to use only reliable `flags.dnd5e.activity.type === "heal"` signal
  - Removed unreliable item name heuristics (checking for "heal", "cure", "restore" in names)
  - Removed `actionType` checks (undefined/unreliable in dnd5e 5.2.4)
  - Per developer review: In dnd5e 5.2.4, healing rolls appear as `roll.type === "damage"` but `activity.type === "heal"` is the reliable indicator
- **API Documentation Console Commands**: Updated all Player Namespace console examples to use `BlacksmithUtils.postConsoleAndNotification` instead of `console.log`
  - All examples now include "Player Stats | " prefix for easy console filtering
  - Consistent with internal codebase logging patterns
  - Properly respects debug flags and notification settings
- **Damage Context Storage**: Upgraded from single-value to queue-based storage for better multi-hit correlation
  - Changed from `Map<actorId, DamageContext>` to `Map<actorId, DamageContext[]>` (queue per target)
  - Stores last 10 damage contexts per target instead of overwriting
  - Includes combat round/turn information for better matching
  - Lazy pruning per target (only removes entries older than 15s for that specific target)
- **Roll Hooks Narrowed**: Roll hooks now only handle crit/fumble detection and metadata
  - `dnd5e.rollAttack`: Only detects crit/fumble, removed hit/miss/damage tracking
  - `dnd5e.rollDamage`: Only forwards to GM for non-GM clients, removed damage tracking
  - All hit/miss/damage resolution moved to `createChatMessage` hook for accuracy
- **Damage Event Hydration**: Enhanced damage event resolution with fallback hydration from chat messages
  - Hydrates missing `attackerActorId` from `message.speaker.actor`
  - Hydrates missing `itemUuid` from `message.flags.dnd5e.item.uuid` (and variants)
  - Hydrates missing `targetUuids` from `message.flags.dnd5e.targets`
  - Provides fallback attacker/item names when resolution fails
  - Ensures context storage always has best available data
- **Sidebar Tab Settings**: Added setting controls for sidebar features
  - `sidebarCombatChatEnabled` setting to enable/disable the Chat + Combat tab
  - `sidebarManualRollsEnabled` setting honored for manual roll button visibility
  - Both settings support dynamic toggling without requiring page reload

### Fixed
- **Healing Message Detection**: Fixed healing messages being incorrectly skipped as "Unlinked Damage"
  - Healing spells now properly detected using `activity.type === "heal"` before skipping unlinked damage
  - Caster's lifetime stats now update when healing spells are cast
  - Target's lifetime stats update via HP delta tracking when healing is applied
- **Healing Stats Not Updating**: Fixed issue where caster's `healing.total` and `healing.given` were not being updated
  - Added `_recordRolledHealing` method to track healing given for casters
  - Healing detection now properly processes healing messages instead of skipping them
- **Inaccurate Hit/Miss Tracking**: Fixed critical bug where all attacks appeared as hits when using midi-qol
  - Root cause: System was inferring "hit = damage rolled", which breaks when midi rolls damage on misses
  - Solution: Now determines hit/miss from attack message (`attackTotal >= target.ac`) before damage is rolled
  - Correctly handles midi-qol "damage on miss" scenarios by classifying as "damage.rolled.other"
- **Unstable Message Correlation**: Fixed damage attribution failures due to unstable `originatingMessage` in dnd5e 5.2.4
  - Replaced `originatingMessage` correlation with stable identifier key (attacker + item + activity + sorted targets)
  - Attack and damage messages now correlate reliably even when `originatingMessage` differs
- **Unconscious Attribution**: Fixed unconscious events showing "Unknown Attacker" and "Unknown Source"
  - Implemented queue-based context storage to handle multiple hits on same target
  - Added combat round/turn matching for better attribution in multi-hit scenarios
  - Increased TTL window from 5s to 15s to account for delays between damage messages and HP updates
  - Enhanced damage event hydration to extract attacker/item/targets from chat message when resolver misses fields
  - Context selection now scores candidates by combat match, recency, and damage amount instead of "last write wins"
- **Crit/Fumble Detection**: Fixed crit/fumble detection failing on advantage/disadvantage rolls
  - Now uses the active d20 result (marked `active: true`) instead of first result
  - Handles multiple d20 terms correctly (e.g., advantage rolls with two d20s)
  - Falls back to first result if no active result is found
- **Healing Race Condition**: Fixed critical race condition where multi-target healing spells (e.g., Mass Cure Wounds) were overwriting healing totals instead of accumulating them
  - Root cause: Multiple concurrent `preTargetDamageApplication` hooks firing simultaneously for the same healer, causing read-modify-write cycles to see stale values
  - Solution: Implemented per-actor update queue system that serializes all stat writes for the same actor
  - Healing totals now correctly accumulate: `0 → 30 → 60 → 90` instead of `0 → 30` (overwritten)
  - Applied to both MIDI healing (`_onMidiPreTargetDamageApplication`) and core healing (`_onChatMessage`) paths
  - Prevents similar race conditions in damage tracking and other concurrent stat updates
- **Combat Summary Totals & Field Mapping**: Fixed combat-end summary totals being incorrect
  - Party totals now aggregate **PCs only** (instead of PCs + NPCs)
  - Corrected mapping so `damageTaken` and `healingGiven` reflect actual tracked values

## [13.0.10]

### Added
- **Combat Start Announcement Card**: Added combat start announcement card that posts when combat is created. Card respects `announceCombatStart` setting and plays `combatStartSound` if configured. Uses dedicated `card-stats-combat-start.hbs` template with green announcement theme.
- **Combat End Announcement Card**: Added "End of Combat" card that appears first in combat summary cards. Card respects `announceCombatEnd` setting and plays `combatEndSound` if configured. Uses dedicated `card-stats-combat-end.hbs` template matching other announcement card styling.
- **Round Start Card**: Renamed `card-stats-round-end.hbs` to `card-stats-round-start.hbs` and updated text to "Round X Begins". Now used for round announcements instead of the section in `cards-common.hbs`.

### Changed
- **Menubar Party Tool Visibility**: Changed party tool visibility to be GM-only instead of leader-only. The tool is now only visible to Game Masters, matching the behavior of other party management tools. This change ensures that non-GM users cannot access party management tools, reinforcing the GM-only nature of these tools.
- **Round and Combat Card Sending**: Updated round and combat stat cards to be sent simultaneously using `Promise.all()` instead of sequentially. This prevents other modules' messages (like movement change or round change cards) from being inserted between stat cards, ensuring all related cards appear together in chat.
- **Round Announcement Template**: Moved round announcement from `cards-common.hbs` to dedicated `card-stats-round-start.hbs` template for better modularity and consistency with other announcement cards.

### Fixed
- **Round Number Calculation**: Fixed round number in round end cards to use the `roundNumber` parameter (the round that just ended) instead of `game.combat.round` (which is already the new round). Round end cards now correctly display the round that just completed.
- **Partial Round Stats on Combat End**: Fixed issue where combat ending mid-round would lose all data from that partial round. The system now detects when combat ends with active round data and processes it like a normal round end (calculates MVP, creates round summary, adds to rounds array) before generating the combat summary. All hits, misses, damage, and other stats from the partial round are now properly captured and included in combat statistics.
- **Combat End Null Reference Error**: Fixed `TypeError: Cannot read properties of null (reading 'turns')` error when combat is deleted. Updated `_onRoundEnd()` and `_prepareTemplateData()` to accept optional combat parameter, allowing them to work with combat objects even when `game.combat` is null during combat deletion. This ensures partial rounds are processed correctly when combat ends mid-round.
- **Token Movement Permission Errors**: Fixed permission errors when players create combat. Added try-catch blocks around setting updates in `createCombat` and `deleteCombat` hooks to gracefully handle permission errors for non-GM clients, preventing error messages from appearing when combat is created or deleted.


## [13.0.9]

### Added
- **Menubar Button Color Customization**: Added `buttonNormalTint` and `buttonSelectedTint` parameters to `registerMenubarTool()` for custom button background colors. Both parameters accept any valid CSS color format (hex, rgba, named colors, HSL, etc.), providing maximum flexibility for tool styling. The normal tint applies to default button state, while the selected tint applies when toggleable tools are active.
- **Menubar Grouping System Documentation**: Added comprehensive documentation for the tiered grouping system, including organization hierarchy (Zone -> Group -> Module -> Order), Blacksmith-defined groups (combat, utility, party, general), group priority rules, and dynamic group creation. Updated all examples to demonstrate best practices with explicit parameter setting.

### Changed
- **Combat Stats Card Structure**: Reverted combat stats cards to simple div-based structure using `<div class="card-header">` and `<div class="section-content">` for consistent styling across all coffee pub cards. Removed Foundry collapsible system integration as it was designed for internal sections, not whole cards.
- **Menubar API Documentation**: Updated API documentation to reflect current implementation with all new parameters (`group`, `groupOrder`, `buttonNormalTint`, `buttonSelectedTint`). Enhanced "Register a Tool" getting started example with complete parameter list following best practices. Updated `getMenubarToolsByZone()` return structure documentation to accurately reflect grouped organization (zone -> group -> module array -> tools). All examples now explicitly show all optional parameters for clarity and maintainability.

### Fixed
- **Menubar Button Tint CSS**: Fixed CSS to properly use custom `--button-normal-tint` and `--button-selected-tint` CSS variables for button background colors. Updated `.blacksmith-menubar-middle .button-active` to use `var(--button-normal-tint, ...)` with fallback to default colors. Updated `.blacksmith-menubar-middle .button-active.tool-active` to use `var(--button-selected-tint, ...)` for active/selected state. Both variables are now properly set in the template's style attribute and applied by CSS with appropriate fallbacks.
- **Menubar Template CSS Variables**: Fixed template to set both `--button-normal-tint` and `--button-selected-tint` as CSS variables in the style attribute instead of data attributes, ensuring they work correctly with CSS fallback values.

### Removed
- **Combat Stats Collapsible Functionality**: Removed all collapsible/expand functionality from combat stats cards. Removed `_registerCollapsibleStateTracking()` method, `sectionStates` static property, and `combatStatsCardStates` client setting. Cards now use the standard non-collapsible card template structure.

### Fixed
- **Auto-Distribute XP Functionality**: Fixed `autoDistributeXp` setting to properly bypass the XP distribution window and automatically distribute XP when enabled. When the setting is enabled, the system now automatically distributes XP based on default values (all players included, no adjustments) without showing the distribution window, effectively mimicking clicking the distribute button without any changes. The implementation uses the same calculation and distribution logic as the manual window, ensuring consistent behavior.
- **Query Window Toolbar Buttons**: Fixed "Send to Chat" and "Copy to Clipboard" toolbar buttons in the query window not finding message content. The issue was caused by attempting to scope queries to the window element after v13 migration, which failed when multiple query windows were open or when viewing recent queries. Simplified the implementation to use `document.querySelector` with `data-message-id` attribute selectors, which works reliably since each message has a unique messageId. Updated all three toolbar button handlers (`_onSendToChat`, `_onCopyToClipboard`, `_onSendToJson`) to use the simplified approach with proper button parameter handling.
- **Toolbar Button Double Events**: Fixed external module toolbar buttons generating duplicate events (2 chat cards) when a tool was registered for both CoffeePub and Foundry toolbars. The issue was caused by both `_wireToolClicks` and `_wireFoundryToolClicks` attaching handlers to the same buttons regardless of which toolbar was active. Added active control checks to each function so `_wireToolClicks` only wires handlers when the CoffeePub toolbar (`blacksmith-utilities` control) is active, and `_wireFoundryToolClicks` only wires handlers when the Foundry toolbar (`tokens` control) is active. This prevents double-wiring when tools appear in both toolbars, ensuring each button click generates only one event.
- **Combat Stats Round Number**: Fixed round number in combat stats cards to use the actual round number from `game.combat.round` instead of maintaining our own counter. Cards now correctly display the current combat round matching the Encounter Tracker.
- **Multiple Combat Timers on Creation**: Fixed issue where multiple combat timers were being created when combat was first created. The timer logic now only processes when `combat.started === true`, preventing timers from starting during combat creation when `updateCombat` hooks fire multiple times (e.g., when adding combatants). Timers will only start when combat is actually started (when "Start Combat" is pressed), not during the creation phase.
- **Combat Tracker Health Ring Visibility**: Fixed combat tracker health ring display for players. Players now see health rings for other players (player-owned actors) showing actual health status, while NPCs display a solid decorative ring (rgba(247, 243, 232, 0.3)) when the `combatTrackerHideHealthBars` setting is enabled. GMs continue to see health rings for all combatants (unless NPC health is hidden). This ensures visual consistency in the combat tracker while respecting privacy settings for NPC health information.

## [13.0.8]

### Fixed
- **External Module Tools Not Appearing**: Fixed external module tools (e.g., bibliosoph) not appearing in the CoffeePub toolbar. The issue was caused by:
  - `onCoffeePub` property filtering not properly handling function values - added `isOnCoffeePub()` helper to evaluate both boolean and function values
  - Missing `name` property defaults for external tools - now defaults to `toolId` if not provided
  - Missing `button`, `title`, and `icon` property defaults - now provides sensible defaults for v13 compatibility
- **Foundry Toolbar Labels and Formatting Missing**: Fixed zone labels, dividers, and formatting not appearing on the core Foundry toolbar (tokens control). Updated `_applyZoneClasses()` to handle both CoffeePub toolbar (`blacksmith-utilities` control) and Foundry toolbar (`tokens` control) by checking the active control and applying zone classes accordingly.
- **Foundry Toolbar Zone Organization**: Fixed tools appearing in wrong zones between CoffeePub toolbar and Foundry toolbar. Updated `getFoundryToolbarTools()` to organize tools by zone and sort by order (matching `getVisibleToolsByZones()` logic), ensuring consistent zone grouping across both toolbars.
- **Foundry Toolbar Timing Issue**: Fixed Blacksmith's own buttons (request roll, replace image) not showing up in the core Foundry toolbar when using `onFoundry()` functions that read settings. Changed `onFoundry` implementations to use `getSettingSafely()` helper instead of manually checking setting availability, preventing tools from being filtered out before settings are registered.
- **General Zone CSS Styling**: Fixed "general" zone tools not receiving proper styling. Added fallback CSS selectors that don't require the `tool` class, ensuring zone classes apply correctly even when buttons don't have the expected class structure.
- **SceneControls Rendering Lifecycle (v13)**: Fixed toolbar tools not persisting after registration by correctly implementing FoundryVTT v13's SceneControls rendering lifecycle:
  - Replaced manual `controls` object manipulation with `ui.controls.render({ reset: true })` to trigger Foundry's internal rebuild pipeline
  - Removed problematic `ui.controls.controls = controls` assignment (read-only getter in v13)
  - Added debounced `requestControlsRender()` to prevent render loops
- **Early Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tokens')` and similar errors during early initialization by:
  - Adding `safeActiveToolName()` and `safeActiveControlName()` helper functions that wrap `ui.controls` access in try-catch blocks
  - Replacing all direct `ui.controls.control?.name` and `ui.controls.tool?.name` accesses with safe helpers
  - Removing `game.activeTool` and `game.activeControl` references that don't exist in v13
- **ReferenceError: activeTool is not defined**: Fixed `activeTool` variable not being declared in `getSceneControlButtons` hook callback scope.
- **Excessive Debug Logging**: Removed all debug logging related to toolbar state, tool registration, and DOM manipulation that was added during troubleshooting.

### Changed
- **Request Roll Tool Organization**: Moved "Request a Roll" tool from "rolls" zone to "gmtools" zone to better reflect its GM-only nature.
- **Request Roll Toolbar Visibility**: Changed request roll tool from hardcoded `onFoundry: true` to read from `requestRollShowInFoundryToolbar` setting, allowing users to control Foundry toolbar visibility independently.
- **Toolbar Display Settings**: Replaced two separate boolean settings (`toolbarShowDividers` and `toolbarShowLabels`) with a single dropdown setting (`toolbarDisplayStyle`) with three options:
  - "Foundry Default" (no organization)
  - "Category Dividers" (visual separators)
  - "Category Labels" (text labels)
  - Default is "Category Labels"
  - Prevents users from enabling both dividers and labels simultaneously
- **Request Roll Menubar Visibility**: Added `requestRollShowInMenubar` setting to control request roll tool visibility in the menubar, allowing independent control from toolbar visibility.

### Added
- **Request Roll Toolbar Settings**: Added two new settings for controlling request roll tool visibility:
  - `requestRollShowInFoundryToolbar` - Control visibility in Foundry toolbar (default: false)
  - `requestRollShowInMenubar` - Control visibility in menubar (default: true)
- **Toolbar Display Style Setting**: Added `toolbarDisplayStyle` dropdown setting to replace the previous two boolean settings, providing a cleaner interface for toolbar organization preferences.

## [13.0.7]

### Added
- **Portrait Replacement Filtering Options**: Added the same filtering options for portrait image replacement that were previously available for token replacement. Portrait replacement now supports independent toggles for:
  - Update Monsters (`portraitImageReplacementUpdateMonsters`)
  - Update NPCs (`portraitImageReplacementUpdateNPCs`)
  - Update Vehicles (`portraitImageReplacementUpdateVehicles`)
  - Update Actors (`portraitImageReplacementUpdateActors`)
  - Skip Linked Tokens (`portraitImageReplacementSkipLinked`)
  These settings allow fine-grained control over which actor types have their portraits automatically replaced, matching the functionality available for token image replacement.
- **Card Theme System Documentation**: Added `migration-cards.md` documentation outlining the migration plan for converting hardcoded colors in card-specific CSS files to use the new CSS variable theme system.
- **Folder Progress Display**: Added folder number display to scan progress messages. Progress now shows "Folder X of Y | Phase X of Y" when scanning multiple image folders, indicating which configured folder is currently being processed.

### Changed
- **Token and Portrait Replacement Filtering**: Enhanced both token and portrait image replacement processing to respect actor type and linked token settings. Both systems now check actor type (monster, NPC, vehicle, character) and linked token status before processing replacements, ensuring consistent behavior across both replacement modes. Added `_shouldUpdateActor()` helper function that centralizes the filtering logic for both token and portrait replacement.
- **Card CSS Architecture Refactoring**: Refactored card CSS system to use CSS variables for complete themeability. Separated layout and theme concerns:
  - `cards-layout.css` - Contains all layout, spacing, typography, and structure (uses CSS variables)
  - `cards-themes.css` - Contains only color definitions via CSS variables
  - All CSS variables are namespaced with `blacksmith-card-` prefix to avoid conflicts with other modules
  - Default variable values defined in `:root {}` for proper CSS inheritance
  - Theme classes only override CSS variable values, never layout properties
  - Used attribute selector `[class*="theme-"]` for theme-specific layout adjustments to automatically support new themes
- **XP Card Theme Migration**: Migrated XP distribution chat cards to use the `blacksmith-card` theme system, matching the structure used by skill check cards. Cards now use `.card-header` and `.section-content` classes from the theme system for consistent styling.
- **Card CSS Namespacing**: All card-related CSS classes are now properly namespaced with `.blacksmith-card` prefix to avoid conflicts with other modules. Section headers, content areas, and all card components are scoped to `.blacksmith-card` selectors.
- **Root Folder Categorization**: Improved categorization logic for files located directly in the root of image directories. Files in the root are now categorized by the root folder name instead of appearing under "all". If a root directory contains only files (no subfolders), the root directory name is used as the category. If a root directory contains both files and subfolders, root files use the root directory name as their category while subfolder files behave normally.

### Fixed
- **Incremental Update Performance**: Fixed incremental updates being significantly slower than full scans by removing artificial delays during incremental update operations. Incremental updates now skip delays that were intended for UI visibility during full scans, making them faster than full rescans.
- **Incremental Update Accuracy**: Fixed incremental update system to properly detect and remove deleted files and renamed folders. The system now correctly identifies files that no longer exist in the file system and removes them from the cache, preventing empty categories from appearing.
- **Empty Folder Cleanup**: Fixed orphaned folder entries remaining in categories after files are deleted. Added cleanup logic that runs after all incremental updates complete to remove empty or invalid folder entries from the cache.
- **Category Button Updates**: Fixed category buttons not updating correctly after incremental scans. Categories now properly reflect the current state of the file system, with deleted folders removed and new categories added as needed.
- **System File Scanning**: Fixed system files (desktop.ini, thumbs.db, .DS_Store, folder.jpg, folder.png, .gitignore, .gitkeep) being scanned and displayed in progress messages. System files are now filtered out early in the scanning process before being displayed or processed.
- **Incremental Update Errors**: Fixed `newFileCount is not defined` error in incremental update completion messages by using the correct `finalFileCount` variable.
- **Folder Cache Type Errors**: Fixed `cache.folders.get(...).push is not a function` errors by adding defensive checks to ensure folder entries are always arrays before calling array methods.

## [13.0.6]

### Added
- **Image Replacement Variability**: Added variability feature for both token and portrait image replacement. When enabled, the system randomly selects from all images with the highest matching score instead of always using the same top match. This adds visual variety when multiple tokens or actors of the same type are created. Variability is enabled by default for both tokens and portraits, with separate settings (`tokenImageReplacementVariability` and `portraitImageReplacementVariability`) that can be toggled independently. The feature respects the existing matching threshold setting, only considering matches above the threshold.
- **Portrait Image Replacement Update Dropped**: Added portrait-specific "Update Dropped Portraits" toggle that works independently from token image replacement. When enabled, actor portraits are automatically updated with the best matching portrait when tokens are created on the canvas. This complements the existing token image replacement feature, allowing both token images and actor portraits to be updated automatically when tokens are dropped.

### Changed
- **Image Replacement Global Controls Layout**: Restructured the global controls header in the image replacement window. The Token/Portrait mode toggle is now left-aligned with "Tokens" label on the left and "Portraits" label on the right of the toggle for clarity. Other global controls (Loot Piles, Convert Dead) are right-aligned. Added CSS styling for the new layout structure.
- **Image Replacement Match Display**: Updated matching logic so that match percentages are always displayed when a token or actor is selected, regardless of which filter button is active (ALL, category buttons, SELECTED). Previously, match percentages only appeared on the SELECTED tab. This ensures consistent visual feedback across all filter modes.
- **Cinematic Roll Button Visual Feedback**: Added color-coded background styling for advantage/disadvantage modifier buttons in cinematic roll window. Disadvantage buttons now have a red tint (`rgba(148, 9, 9, 0.5)`) and advantage buttons have a green tint (`rgba(22, 77, 11, 0.5)`) to provide clear visual distinction between roll types.
- **Skill Check Card Theme Migration**: Migrated skill check chat cards to use the `blacksmith-card` theme system for consistent styling and v13 compatibility. Cards now leverage the standard `.card-header` styling from the theme instead of custom header styles.
- **Card CSS Organization**: Moved all skill check card-related CSS from `window-skillcheck.css` to dedicated `cards-skill-check.css` file for better modularity and maintainability.
- **Template Naming**: Renamed skill check card template from `skill-check-card.hbs` to `card-skill-check.hbs` to match naming conventions with other card templates.

### Fixed
- **Cinematic Window Circular Buttons**: Fixed circular buttons (dice roll buttons and close button) in the cinematic roll window appearing elliptical/horizontally compressed after v13 migration. Added `box-sizing: border-box`, `min-width`, `min-height`, and `aspect-ratio: 1` to ensure buttons maintain perfect circular shape. Buttons now display correctly as circles regardless of flex container constraints.
- **Cinematic Button Icon Alignment**: Fixed icon misalignment in cinematic roll buttons caused by unnecessary `padding-left: 3px` on icons. Removed padding since flexbox centering (`justify-content: center` and `align-items: center`) already properly centers icons. Added explicit `padding: 0` and `margin: 0` to roll area container to prevent any default spacing issues.
- **Unused Code Cleanup**: Removed unused `getResultSound()` function from `window-skillcheck.js` that was never called. Sound logic is handled directly in `deliverRollResults()` and `updateCinemaOverlay()` functions.
- **Long Name Ellipsis**: Fixed ellipsis for long actor names in roll buttons, ensuring names truncate properly with ellipsis in both pre-roll (pending roll buttons) and post-roll (completed roll results) states. Added proper flex container constraints and `min-width: 0` to all parent containers to allow proper text overflow handling.

## [13.0.5]

### Fixed
- **Journal Tools querySelector Error**: Fixed `TypeError: nativeElement.querySelector is not a function` in Journal Tools window. Updated `_getNativeElement()` method to include jQuery detection and validation, ensuring it returns a valid native DOM element with `querySelector` method before use. Matches the pattern used in other windows for v13 compatibility.
- **SceneControls Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tools')` errors from third-party modules (tile-sort, monks-wall-enhancement, walledtemplates, multi-token-edit) when `refreshSceneControls()` was called before controls were fully initialized. Added validation checks to ensure controls object exists, is populated, and `ui.controls` has been rendered before calling `getSceneControlButtons` hook. Additionally restricted `refreshSceneControls()` to only run for GMs since players don't have access to scene controls, preventing 96+ errors for players when other modules try to access controls that don't exist for them.
- **Menubar Health Tooltip Privacy**: Fixed menubar combat portrait tooltips showing HP information when health rings are hidden. Tooltips now conditionally exclude HP information when `menubarCombatHideHealthBars` is enabled for non-GM users, matching the health ring visibility behavior. GMs always see full tooltip information regardless of the setting.
- **Menubar Token Panning Visibility**: Fixed menubar combat portrait clicks panning to tokens that players cannot see. Panning now checks token visibility for non-GM users, including hidden status, canvas visibility, and user visibility (vision/walls). Players can only pan to tokens they can actually see on the canvas. GMs can always pan to any token. Fixed token highlight method to use `setHighlight()`/`clearHighlight()` instead of deprecated `highlight()` method.
- **Combat Tracker and Menubar Hidden Token Visibility**: Fixed hidden tokens and hidden combatants not being properly handled in both combat tracker and menubar. Hidden combatants (via `combatant.hidden` or `token.hidden`) now immediately disappear from players' view in both locations, matching the combat tracker's native behavior. GMs always see all combatants with visual indicators: `hide` class in combat tracker and `combat-token-hidden` class in menubar for styling purposes. When a token is hidden on the canvas, it is also hidden in the combat tracker for players, ensuring consistent visibility rules across all combat interfaces.
- **Effects Panel Menubar Overlap**: Fixed effects panel overlapping with the menubar when present. The effects panel now shifts down by the menubar height using `calc(5px + var(--blacksmith-menubar-interface-offset))` to preserve its original 5px top offset while accounting for the fixed menubar, matching the behavior of other UI elements like chat.
- **Clarity Mode GM-only Brightness**: Reworked clarity brightness to be GM-local only using a PIXI color-matrix filter on the client; no `scene.update` calls so players are unaffected. Restores cleanly on deactivate and across scene changes.
- **Clarity Mode Vision Override**: While clarity is active, GM disables token-only vision (`canvas.sight.tokenVision = false`) to keep the whole scene visible even with a selected token; restores the original setting on deactivate. Fog transparency remains a client-only 10% alpha tweak for the GM.
- **Clarity Token Overlays**: Updated hatch overlay asset (overlay-pattern-04) and ensured overlays reapply on token control without affecting players.

## [13.0.4]

### Fixed
- **Combat Tracker Health Ring Alignment**: Fixed health rings misaligning with portraits when combatant names wrap to multiple lines. The ring container now takes the full height of the combatant and centers the ring vertically using CSS-only solution, eliminating the need for JavaScript positioning calculations and ResizeObserver.
- **SceneControls Deprecation Warning**: Replaced deprecated `SceneControls.initialize()` calls with v13+ `render({controls, tool})` API. Created `refreshSceneControls()` helper function that rebuilds controls via `getSceneControlButtons` hook and renders with the updated controls, preserving active tool state. This eliminates deprecation warnings and ensures compatibility with Foundry v15.
- **Combat Tracker NPC Health Ring Visibility**: Fixed NPC health rings being visible to players in the combat tracker. Health rings for NPCs are now hidden from non-GM users when the `combatTrackerHideHealthBars` setting is enabled, matching the menubar behavior. GMs always see health rings for all combatants regardless of the setting.

## [13.0.3] - Sockets

### Fixed
- **Journal Double-Click Image Editing**: Simplified image double-click handler in edit mode to directly click the image toolbar button instead of attempting to access Prosemirror internals. This provides a more reliable and maintainable solution that works consistently.
- **Encounter Toolbar Page Navigation**: Fixed encounter toolbar disappearing when switching between journal pages. The toolbar now correctly detects page navigation, finds the active page (not just any page), cleans up old toolbars from previous pages, and processes toolbar updates even when app window lookup fails. Increased delays to ensure active page class has settled before processing.
- **Socket API Timing Issues**: Fixed race condition where `module.api.sockets` was set asynchronously after `module.api` was created, causing external modules to fail when accessing the socket API. Added polling mechanism in `BlacksmithAPI.getSockets()` to wait up to 2 seconds for socket API initialization.
- **Socket API SocketLib Compatibility**: Fixed socket API to properly work with SocketLib sockets, which use `executeForOthers()` pattern instead of `emit()`. Added wrapper that translates `emit()` calls to SocketLib's execution pattern for external modules while maintaining backward compatibility with internal Blacksmith code.
- **Socket API Native Fallback**: Fixed native socket fallback to include `emit()` method, ensuring the socket API works whether SocketLib is available or not. Native fallback now properly implements the full socket interface.
- **Socket API Global Access**: Added `window.Blacksmith.socket` global alias for backward compatibility with documented access patterns.

### Changed
- **Socket API Logging**: Reduced verbose logging for socket event registration to only log on first registration per event name to reduce console spam.

### Added
- **Socket API Documentation**: Updated `api-sockets.md` with multiple access patterns and timing-aware initialization examples to help external modules properly use the socket API, including proper handling of asynchronous socket initialization.

## [13.0.2] - v13 Migration

### Fixed
- **Toolbar - External Module Tool Registration:** Fixed external modules' tools not appearing in CoffeePub toolbar
  - Added automatic toolbar refresh when tools are registered via `registerToolbarTool()` API
  - Tools now appear immediately after registration without requiring manual refresh
  - Added debug logging to help diagnose tool registration issues
- **Toolbar - v13 SceneControl Structure:** Fixed `TypeError: Cannot read properties of undefined (reading 'onChange')` when switching toolbars
  - Updated control structure to match v13 `SceneControl` interface requirements
  - Added required `activeTool` property (must point to valid tool key)
  - Added required `onChange` and `onToolChange` handlers on control
  - Added required `order` and `visible` properties
  - Changed from deleting/recreating control to updating in place to preserve Foundry's tool references
  - Merged tools instead of replacing entire tools object to prevent reference loss
- **Toolbar - Auto-Activation of Tools:** Fixed tools auto-triggering when control opens (e.g., "Request a Roll" dialog opening automatically)
  - Removed `onClick` from `SceneControlTool` objects (v13 compatibility shim auto-calls it from `onChange`)
  - Changed `onChange` handlers to no-ops that never call `tool.onClick`
  - Implemented `_wireToolClicks()` to attach real DOM click handlers directly to rendered buttons
  - Tool buttons now respond only to actual user clicks, not control activation
  - Prevents v13 compatibility shim from auto-calling `onClick` on control activation
- **Toolbar - Tool Button Clicks:** Fixed tool buttons not responding to clicks in CoffeePub toolbar
  - Implemented direct DOM event handlers via `_wireToolClicks()` function
  - Handlers attached to rendered `<button data-tool="...">` elements after toolbar renders
  - Works correctly even when clicks occur on tooltip elements (ASIDE)
  - Handlers prevent default behavior and stop propagation to avoid conflicts with Foundry's toggle logic
- **Toolbar - Tool Updates:** Fixed tool updates not preserving Foundry's internal references
  - Changed from replacing entire tools object to merging tools in place
  - Preserves active tool references when updating control
  - Explicitly removes `onClick` from updated tools to prevent shim issues
- **Settings UI - v13 CSS Selectors:** Fixed settings styling not applying due to v13 DOM structure changes
  - Replaced `data-setting-id` attribute selectors (removed in v13) with `:has()` selectors targeting `label[for]` attributes
  - Updated all selectors from `div[data-setting-id*="coffee-pub-"]` to `.form-group:has(label[for*="settings-config-coffee-pub-"])`
  - Changed `.notes` class references to `.hint` (v13 renamed the class)
  - Added missing color declarations for light mode (labels, hints) that were previously inherited from Foundry defaults
  - Settings now properly styled in v13's new HTML structure
- **Settings UI - Dark Mode Support:** Fixed dark mode styles not applying
  - Changed dark mode selectors from `html.theme-dark` to `[data-theme="dark"]` to match Foundry v13's theme attribute on `<body>`
  - Added comprehensive dark mode color overrides for all heading levels (H1, H2, H3, H4) and general settings
  - Dark mode now properly detects and applies theme-specific colors for backgrounds, text, and borders
  - Settings UI now fully supports both light and dark themes

### Changed
- **Toolbar API - Tool Registration:** Enhanced `registerToolbarTool()` to automatically refresh toolbar
  - Toolbar now refreshes automatically after tool registration
  - Re-triggers `getSceneControlButtons` hook to rebuild toolbar with new tools
  - Added debug logging for tool registration status
- **Toolbar - v13 Migration:** Migrated toolbar to v13 `SceneControl` interface
  - Tools use `onChange` as no-ops (v13 requirement) but never call `tool.onClick`
  - Real click handling done via direct DOM event handlers in `_wireToolClicks()`
  - Control structure matches v13 requirements exactly
  - All tools have proper `onChange` handlers (no-op for button tools)
- **Settings UI - v13 CSS Migration:** Migrated settings CSS to v13 HTML structure
  - Replaced deprecated `data-setting-id` attribute targeting with `:has()` pseudo-class selectors
  - Updated class names from `.notes` to `.hint` to match v13 naming
  - Added explicit color declarations for all text elements (previously relied on Foundry defaults)
  - Implemented dark mode support using `[data-theme="dark"]` attribute selector
  - All heading types (H1, H2, H3, H4, HR, SP) now have proper light and dark mode styling

### Technical
- **Toolbar - v13 Compatibility:** Addressed v13 compatibility shim behavior
  - v13 automatically calls `onClick` from inside `onChange` when tool is activated
  - Solution: Don't define `onClick` on `SceneControlTool`, make `onChange` a no-op, and wire real DOM click handlers
  - `_wireToolClicks()` attaches event listeners directly to rendered buttons, bypassing v13's shim entirely
  - This approach completely avoids auto-activation issues and provides reliable click handling
- **Toolbar - Reference Preservation:** Improved tool reference handling
  - Update tools in place using `Object.assign` to preserve Foundry's internal references
  - Merge tools instead of replacing entire object
  - Preserve active tools when they're being removed (mark as invisible instead of deleting)
- **Settings UI - v13 Theme Detection:** Updated theme detection mechanism
  - Foundry v13 uses `data-theme="dark"` attribute on `<body>` element instead of `html.theme-dark` class
  - Changed all dark mode selectors from `html.theme-dark` to `[data-theme="dark"]`
  - Theme detection now correctly matches Foundry's v13 implementation
  - Why: v13 changed from class-based theme detection to data attribute-based detection for better flexibility



## [13.0.1] - v13 Migration

### Fixed
- **Combat Tracker - Health Ring Alignment:** Fixed health rings not aligning correctly over token/portrait images in the combat tracker
  - Updated CSS positioning for `.health-ring-container` and SVG elements
  - Changed insertion logic to insert health ring container right before token image element
- **Combat Tracker - Roll Remaining Button:** Fixed "Roll Remaining" button not appearing in combat tracker
  - Migrated button creation to native DOM methods (removed jQuery dependency)
  - Updated button structure to match v13 format with `data-action` attribute
  - Improved insertion logic with multiple search roots for better compatibility
  - Fixed event listener removal to use native `removeEventListener` instead of jQuery
  - Increased hook priority to ensure button appears after other combat tracker elements
- **Combat Tracker - Planning Timer:** Fixed multiple planning timer issues
  - Fixed timer not being visible or clickable
  - Fixed timer showing "0s Planning" when active (state initialization issue)
  - Fixed timer not gracefully disappearing after planning ended
  - Fixed excessive re-renders by adding initiative check before showing timer
  - Fixed timer appearing before all initiatives were rolled
  - Changed HTML structure from `.combatant.planning-phase` to `.planning-timer-item` to avoid CSS conflicts
  - Updated CSS to force visibility with important flags
  - Enhanced fade-out to work in both sidebar and popout windows
  - Fixed setting access errors by using `getSettingSafely` utility
- **Combat Tracker - Combat Timer:** Fixed combat timer visibility and timing issues
  - Fixed timer not showing in popped-out combat window
  - Fixed timer not being clickable
  - Fixed timer showing before all initiatives were rolled
  - Updated selectors from `#combat-tracker` to `.combat-tracker` for v13 compatibility
  - Enhanced `updateUI()` to find timer elements in both sidebar and popout windows
- **Combat Tracker - Popout Window Closing:** Fixed popped-out combat window not closing when combat ends
  - Enhanced `closeCombatTracker()` to check multiple ways to find and close popout window
  - Added direct DOM lookup for `#combat-popout` element
  - Added fallback to click close button if Application instance not found
  - Made `endCombat` hook callback async to properly await window closing
- **XP Distribution Window:** Fixed jQuery-related errors in XP distribution window
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelector is not a function` errors in multiple methods
  - Added jQuery detection and conversion for all DOM queries
  - Updated `_updateXpDisplay()`, `_getIncludedPlayerCount()`, `_updateXpDataPlayers()`, `_onModeToggleChange()`, and `_collectMilestoneData()` methods
- **CSS Editor Window:** Fixed jQuery-related errors in CSS Editor
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `Cannot read properties of undefined (reading 'toggle')` error
  - Added jQuery detection and conversion for `html` and `this.element` in all methods
  - Fixed World Settings button to open World Config instead of general settings
  - Added missing `_resetApplyButton` method
  - Updated `render()`, `_updateObject()`, `_setupSearchListeners()`, `_performSearch()`, `_highlightCurrentMatch()`, `_replaceCurrent()`, and `_replaceAll()` methods
- **Journal Tools Window:** Fixed jQuery-related errors in Journal Tools
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelectorAll is not a function` and `this.element.querySelector is not a function` errors
  - Added `_getNativeElement()` helper method for jQuery detection
  - Fixed journal page opening when clicking "replace title" in search results
  - Added `_viewJournalPage` helper method with multiple strategies for opening journal pages
  - Added missing `_resetApplyButton` method
  - Updated all methods to use native DOM after jQuery detection
- **Blacksmith Window Query:** Fixed jQuery-related errors in query window
  - Fixed `html.querySelector is not a function` and `html.querySelectorAll is not a function` errors
  - Fixed `html.addEventListener is not a function` error
  - Fixed `this.element.querySelector is not a function` errors in `displayMessage()` and other methods
  - Added `_getNativeElement()` helper method for jQuery detection
  - Added drop zone handlers for criteria drop zone in assistant workspace (skill check assistant)
  - Updated `activateListeners()`, `initialize()`, `displayMessage()`, `_scrollToBottom()`, and `switchWorkspace()` methods

### Changed
- **jQuery Removal:** Continued migration from jQuery to native DOM methods across all application windows
  - All application windows now handle native DOM elements with jQuery detection fallbacks
  - Added `_getNativeElement()` helper method pattern for consistent jQuery detection
  - Replaced jQuery event handlers with native `addEventListener`
  - Replaced jQuery DOM manipulation with native methods (`querySelector`, `appendChild`, `insertBefore`, etc.)
  - Updated XP Distribution, CSS Editor, Journal Tools, and Blacksmith Window Query windows
- **Combat Tracker Structure:** Updated combat tracker HTML structure for v13 compatibility
  - Planning timer now uses `.planning-timer-item` class instead of `.combatant.planning-phase`
  - Roll Remaining button now uses `<button>` element with v13-compatible attributes
  - All selectors updated to match v13 DOM structure
- **Query Tool - Assistant Workspace:** Added drop zone functionality for skill check assistant
  - Added event handlers for criteria drop zone to accept token, actor, and item drops
  - Drop zone now populates skill check form fields automatically when items are dropped
  - Supports drops from canvas (tokens) and sidebar (actors and items)

### Technical
- **Initiative Checks:** Added initiative validation before showing timers
  - Planning timer and combat timer now only appear after all combatants have rolled initiative
  - Prevents timers from appearing prematurely and reduces unnecessary re-renders
- **Hook Priorities:** Adjusted hook priorities for proper execution order
  - Roll Remaining button hook priority set to 5 (runs after planning timer at priority 3)
  - Ensures proper element insertion order in combat tracker
- **Error Handling:** Improved error handling for async operations
  - Added proper delays and error handling for window closing operations
  - Enhanced fallback mechanisms for finding and closing popout windows

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- All combat tracker functionality has been restored and tested in v13
- jQuery removal is complete for combat tracker components and all major application windows
- All application windows (XP Distribution, CSS Editor, Journal Tools, Blacksmith Window Query) now use native DOM with jQuery detection fallbacks


## [13.0.0] - v13 Migration Begins

### Important Notice
- **v13 MIGRATION START:** This version begins the migration to FoundryVTT v13
- **Breaking Changes:** This version requires FoundryVTT v13.0.0 or later
- **v12 Support Ended:** v12.1.23-FINAL was the last version supporting FoundryVTT v12

### Changed
- **Minimum Core Version:** Updated to require FoundryVTT v13.0.0
- **Module Version:** Bumped to 13.0.0 to align with FoundryVTT v13
- **Compatibility:** Module now exclusively supports FoundryVTT v13

### Technical
- **Migration Status:** Beginning v13 migration work
- **Breaking Changes:** Will address v13 API changes including:
  - `getSceneControlButtons` hook API changes (controls from array to object)
  - jQuery removal (migrating to native DOM methods)
  - ApplicationV2 framework migration (planned for future versions)

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- See `documentation/migration-v13-plan.md` for migration plan and progress tracking
- This version may have incomplete v13 compatibility - migration work in progress

## [12.1.23] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Blacksmith compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

### Changed
- **Documentation Updates:** Updated README.md and module.json to reflect v12.1.23 as the final v12 release
- **Compatibility Notice:** Added clear notice that v12.1.23 is the last version supporting FoundryVTT v12
- **Migration Preparation:** Module is now locked for v12 compatibility; v13 migration work will begin in next version

### Technical
- **Version Lock:** Module version locked at 12.1.23-FINAL for v12 compatibility
- **Future Development:** All development moving forward will target FoundryVTT v13 exclusively

## [12.1.22]

### Added
- **Compendium Table Import Support:** Added comprehensive compendium table import functionality for both items and actors
  - New "Compendium Items" template option for rolltable imports
  - New "Compendium Actors" template option for rolltable imports
  - Dynamic compendium list generation from configured settings
  - Formatted item/actor lists with compendium names and entries
  - Template placeholders automatically populated with user's configured compendiums

### Fixed
- **Table Import Range Calculation:** Fixed critical bug in table range calculation logic
  - Properly handles explicit range bounds (rangeLower and rangeUpper)
  - Correctly calculates ranges when only lower bound is provided
  - Prevents gaps and overlaps in range assignments
  - Added validation to ensure rangeLower <= rangeUpper
- **Dynamic Table Formula:** Fixed hardcoded "1d100" formula to dynamically calculate based on actual table range
  - Formula now automatically adjusts to match maximum range value (e.g., 1d20, 1d500)
  - Ensures formula always matches the table's actual range coverage
- **Compendium Type Mapping:** Fixed compendium result type mapping for FoundryVTT compatibility
  - Correctly maps "Compendium" type to "pack" (FoundryVTT's actual type name)
  - Properly sets `documentCollection` field for pack-type results
  - Ensures compendium dropdowns select correct compendium on import
- **ImageCacheManager.addTagToFile Error:** Fixed "addTagToFile is not a function" error when toggling favorites
  - Removed redundant calls to non-existent `addTagToFile()` and `removeTagFromFile()` functions
  - Tags are already updated directly in fileInfo.metadata.tags array
  - Favorite toggle functionality now works correctly

### Changed
- **Table Import UI:** Improved table import dropdown labels for better clarity
  - Simplified option names (e.g., "Simple Text" instead of "Simple Text Rollable Table")
  - Reorganized options for better logical grouping
  - Updated button text to "Copy Template" for consistency

## [12.1.21] - 2025-11-13

### Added
- **Loot Pogs:** Added new images for when tokens are converted to loot.

### Fixed
- **Loot Conversion Sound:** Honored the "No Sound" option by skipping playback when `tokenLootSound` is disabled.
- **Loot Conversion Image:** Restricted loot image swaps to cases where the Item Piles module is active and rely on Item Piles' `keepOriginal` handling instead of forcing a new texture.
- **Loot Image Preservation:** Restoring a loot pile now updates the token document reliably so the original art persists after refresh.
- **Loot Table Quantities:** Loot item counts now randomize between 1 and the configured quantity setting instead of using roll result ranges.
- **Loot Coin Setting:** Coins are only added when the `tokenLootAddCoins` toggle is enabled.
- **Epic Loot Odds:** Epic loot tables now respect the configured odds and always award a single item when triggered.
- **Loot Coin Maximums:** Coin rewards now roll between 1 and the per-currency maximum settings (including electrum) instead of using a static percentile table.
- **Dead Token Toggle:** Dead token replacement now correctly follows the `enableDeadTokenReplacement` setting in both UI and automation hooks.
- **Indicator Visibility:** Current-turn and targeted rings now respect per-user token visibility, hiding from players when tokens are invisible to them.
- **Combat Bar Details:** Secondary combat bar now reports turn order labels and formatted total combat time.


## [12.1.20] - 2025-11-12

### Added
- **Party Statistics Window:** New menubar tool and application providing combat history, lifetime MVP leaderboard, summary chips, and MVP highlights styled after the XP distribution interface.
- **Stats API Exposure:** Stats window data now available through `StatsWindow` and supporting API methods for other modules to consume combat summaries and lifetime MVP data.

### Changed
- **Documentation:** Refreshed `documentation/api-stats.md`, `api-core.md`, and `architecture-stats.md` with updated architecture details, API recipes, retention policies, and integration samples for the stats system.
- **Templates & Styles:** Introduced dedicated `window-stats.hbs` and `styles/window-stats.css` to align party stats UI with the module design system while keeping assets modular for future module splits.

### Fixed
- **Menubar Combat Health Rings:** Health rings now refresh in real time by listening to `updateActor` and `updateToken` hooks and re-rendering the combat secondary bar whenever combatant HP changes.
- **Menubar Visibility Controls:** Honored `excludedUsersMenubar` by skipping menubar/secondary-bar rendering and interactions for listed users, ensuring GM-configured exclusions take effect.
- **NPC Health Privacy Setting:** Added `menubarCombatHideHealthBars` (world) so GMs can hide monster health rings for players while retaining full visibility themselves.


## [12.1.19] - Dynamic Compendium Configuration and Expanded Type Support

### Added
- **Configurable Compendium Counts:** Added per-type settings to configure how many compendium priority slots are available
  - `numCompendiumsActor` - Configure number of Actor compendium slots (1-20, default: 1)
  - `numCompendiumsItem` - Configure number of Item compendium slots (1-20, default: 1)
  - `numCompendiumsSpell` - Configure number of Spell compendium slots (1-20, default: 1)
  - `numCompendiumsFeature` - Configure number of Feature compendium slots (1-20, default: 1)
  - Settings require reload to take effect when changed

- **Selected Compendium Arrays:** New arrays exposed to external modules containing only configured compendiums in priority order
  - `arrSelectedMonsterCompendiums` - Actor compendiums in priority order
  - `arrSelectedItemCompendiums` - Item compendiums in priority order
  - `arrSelectedSpellCompendiums` - Spell compendiums in priority order
  - `arrSelectedFeatureCompendiums` - Feature compendiums in priority order
  - Arrays automatically update when compendium settings change
  - Position in array = Priority (index 0 = Priority 1, etc.)

- **Expanded Compendium Type Support:** Dynamic registration for ALL compendium types found in the system
  - Automatically registers settings for any compendium type (JournalEntry, RollTable, Scene, Macro, Playlist, Adventure, Card, Stack, etc.)
  - All types get full settings support: numCompendiums, searchWorldFirst, searchWorldLast, and priority compendium slots
  - Selected arrays created for all types (e.g., `arrSelectedJournalEntryCompendiums`, `arrSelectedRollTableCompendiums`)
  - No hardcoding required - system adapts to available compendium types

### Changed
- **Compendium Settings Registration:** Refactored from hardcoded Actor/Item/Spell/Feature to fully dynamic system
  - All compendium types now use unified dynamic registration function
  - Settings automatically registered based on types found in system
  - Backward compatible - existing settings and variable names unchanged

- **Compendium Search Logic:** Updated to respect per-type configured counts instead of hardcoded limit of 8
  - `common.js`: Actor and Item compendium search loops now use dynamic counts
  - `manager-compendiums.js`: All compendium type searches respect configured counts
  - `journal-tools.js`: Compendium setting key arrays generated dynamically
  - All search functions now honor user-configured compendium limits

- **Spell and Feature Compendum Filtering:** Switched from content-based to type-based filtering for Spell and Feature compendiums
  - Now uses all Item compendiums like Actor compendiums (simpler and works synchronously)
  - Removed "Spells:" and "Features:" prefixes from dropdown labels since filtering is now type-based
  - Eliminated async complexity from compendium choice initialization
  
- **Removed Duplicate Settings:** Cleaned up duplicate compendium settings from old code organization
  - Removed duplicate `defaultEncounterFolder` setting in favor of `encounterFolder`
  - Removed old hardcoded compendium registration patterns that were superseded by dynamic system
  
- **Code Cleanup:** Removed unused async helper functions from `getCompendiumChoices()`
  - Removed `getContentTypes()` and `buildContentTypeMap()` functions that were no longer needed
  - Simplified compendium choice generation logic

### Fixed
- **Async Function Issue:** Fixed `getCompendiumChoices()` async/await mismatch
  - Function properly marked as `async` to support `await buildContentTypeMap()` call
  - Added `await` when calling `getCompendiumChoices()` in `registerSettings()`
  - Ensures compendium choice arrays are populated before settings registration

- **Race Condition:** Fixed `combatTrackerOpen` setting access before registration
  - Added safety checks using `game.settings.settings.has()` before accessing setting
  - Prevents errors when combat-tracker hook runs before settings are registered
  - Applied to both ready hook and combat start hook contexts
  - Applied to `combatTrackerShowPortraits`, `showRoundTimer`, and `menubarCombatShow`
  - Prevents "setting is not registered" errors during module initialization
  - Imported `getSettingSafely` into affected modules

- **Sync Initialization:** Fixed compendium choices not being available during settings registration
  - Added synchronous initialization of basic compendium choices in `registerSettings()`
  - `getCompendiumChoices()` now runs async in background without blocking settings registration
  - Ensures all compendium dropdowns have choices available immediately

## [12.1.18] - Menubar Performance Optimization, Token Movement Features, and Code Cleanup

### Added
- **Token Movement Sounds:** Complete audio feedback system for token movement
  - Settings for enabling/disabling movement sounds
  - Separate sound selection for player tokens vs monster/NPC tokens
  - Volume control slider (0.0 to 1.0)
  - Distance threshold setting (1-50 feet) to prevent sounds on tiny movements
  - GM-only processing to avoid permission errors
  - Sound plays once (non-looping) and broadcasts to all players
  - Integration with existing movement hooks and automated movement detection

- **Expanded Sound Library:** Added 49 new sound effects across multiple categories
  - **Cartoon Sounds (2):** Tiptoe, Twangs
  - **General Effects (6):** Candle Blow, Cocktail Shaker, Explosion, Owl Hoot, Sad Trombone, Toilet Flushing
  - **Gore Effects (5):** Armor Blood, Blood Splash, Cut Splash, Entrails Splash, Deep Slash
  - **Object Interactions (9):** Chest Lid Open, Chest Open, Chest Poison, Chest Treasure, Lever 01-03, Sack Open Long/Short
  - **Reaction Sounds (18):** Crowd Clapping (Large/Small), Crowd Laughing, Gasp, Grunt Hit/Kick Object, Huzzah, Man Battlecry/Grunt/Huuuragh/Oof/Pain, Wilhelm Scream, Woman Groan/Pain/Scream, plus existing Ahhhhh/Oooooh/Yay
  - **Step Sounds (10):** Beast, Creak 01-03, Metal, Stairs Down/Up, Water, Wood 01-02
  - All sounds organized in subfolders with proper categorization and alphabetical sorting
  - Removed duplicate root folder sounds in favor of organized subfolder versions

### Fixed
- **CRITICAL: Menubar Performance Issue:** Fixed massive performance bottleneck where menubar was re-rendering 14+ times during initialization
  - Root cause: `registerMenubarTool()` was triggering `renderMenubar()` for every single tool registration
  - Solution: Implemented batch tool registration system with single render at completion
  - Added `_isRegisteringTools` flag to prevent renders during tool registration
  - Added `_defaultToolsRegistered` flag to prevent duplicate tool registration
  - Performance improvement: Reduced menubar renders from 14+ to 1 during initialization
  - Tooltip issues resolved as side effect of eliminating constant re-renders

- **Token Image Replacement Threshold Slider:** Fixed threshold slider visibly jumping during image scanning
  - Root cause: `_initializeThresholdSlider()` was being called on every UI re-render during scanning
  - Solution: Added guard clause to prevent re-initialization during active scanning
  - Threshold slider now remains stable during image scanning process

- **Token Rotation Permission Errors:** Fixed permission errors when players tried to rotate tokens
  - Root cause: Token facing logic was running on all clients, causing permission conflicts
  - Solution: Implemented proper permission checking - GM can rotate any token, players can only rotate their own tokens
  - Added `testUserPermission("OWNER")` check for non-GM users
  - Eliminated "User lacks permission to update Token" errors

- **Memory Monitor Tooltip Display:** Fixed memory monitor tooltip showing only memory value instead of detailed information
  - Root cause: Constant menubar re-renders were interfering with tooltip processing
  - Solution: Resolved automatically with menubar performance fix
  - Tooltips now display comprehensive memory breakdown (client heap, server heap, GPU textures)

### Performance
- **Menubar Rendering Optimization:** Dramatically improved menubar initialization performance
  - Eliminated 14+ unnecessary menubar re-renders during tool registration
  - Single render after all tools are registered instead of per-tool renders
  - Expected 90%+ reduction in menubar render operations during module load
  - Improved overall module startup performance

### Code Cleanup
- **Debug Code Removal:** Cleaned up all Phase 1 analysis and debug code
  - Removed verbose comment headers and investigation notes
  - Removed debug logging (`postConsoleAndNotification` calls for monitoring)
  - Removed stack trace logging in `renderMenubar()`
  - Removed "END - HOOKMANAGER CALLBACK" comments
  - Kept only essential functional code and performance optimizations

### Technical Details
- Implemented `MenuBar._isRegisteringTools` flag for batch rendering control
- Implemented `MenuBar._defaultToolsRegistered` flag for duplicate prevention
- Added guard conditions in `registerMenubarTool()` to skip renders during batch operations
- Single `renderMenubar()` call at end of `registerDefaultTools()` instead of per-tool calls
- Maintained all existing functionality while dramatically improving performance

---

## [12.1.17] - Performance Optimizations and Code Cleanup

### Added
- **Memory Monitor Tool:** New performance monitoring tool for the menubar
  - Shows real-time memory usage (client heap, server heap, GPU textures)
  - Configurable poll interval (5 seconds to 5 minutes)
  - Detailed tooltip with comprehensive memory breakdown
  - Click to log detailed memory information to console
  - Cached data to prevent performance impact from frequent API calls

- **Menubar Tool Visibility Settings:** Added individual show/hide controls for menubar tools
  - `Show Settings Tool` - Toggle settings tool visibility (default: hidden)
  - `Show Refresh Tool` - Toggle refresh tool visibility (default: hidden)  
  - `Show Performance Monitor Tool` - Toggle performance monitor visibility (default: hidden)
  - `Performance Monitor Poll Interval` - Slider to set update frequency (5s to 5min, default: 5s)

### Performance
- **Search Performance Dramatically Improved:** Implemented comprehensive caching system for search operations
  - Added LRU cache (50 entries, 5-minute TTL) for search results
  - Cached searches now return results in < 10ms (vs 500-1000ms before)
  - Cache automatically invalidates when filters/tags/categories change
  - Expected 50-90% speedup for repeated searches
  
- **Tag Filtering Optimized:** Pre-compute tags during cache build instead of recalculating on every operation
  - Tags (metadata + creature types + categories) now stored in `file.metadata.tags` during cache build
  - Simplified `_getTagsForFile()` from 50 lines to 10 lines (eliminates heavy Map iterations)
  - Simplified `_getTagsForMatch()` from 65 lines to 18 lines
  - Expected 20-30% speedup on tag filtering operations
  
- **Browse Mode Verified:** Confirmed browse mode uses efficient mapping (no scoring calculations)
  - Browse mode returns results instantly with simple `.map()` operation
  - No relevance calculations performed in browse mode

### Fixed
- **Turn Ring Scene Change Issue:** Fixed turn indicator ring not loading on scene changes
  - Added turn indicator update to `canvasReady` hook callback
  - Turn ring now properly recreates after scene changes using same pattern as death save ring
  - Added safety checks to prevent PIXI graphics destruction errors

- **PIXI Graphics Destruction Safety:** Added safety checks for graphics object destruction
  - Check if graphics object is already destroyed before calling `destroy()`
  - Check if canvas/parent exists before removing from canvas
  - Prevents "Cannot read properties of null" errors during scene changes

- **Progress Bars Not Updating:** Fixed progress bars not showing during image scanning
  - Root cause: `updateScanProgress()` updated window properties but template read from cache properties
  - Solution: Update both window AND cache properties in `updateScanProgress()` and `completeScan()`
  - Added immediate window render when scanning starts to show progress bars
  - Progress bars now show and update correctly during scanning operations

### Removed
- **Legacy Code Cleanup:** Deleted 305+ lines of unused/redundant code
  - Removed entire `_streamSearchResults()` method (215 lines) - legacy duplicate search logic using old scoring
  - Simplified tag extraction methods (90 lines saved)
  - Removed redundant creature type and folder path calculations from UI layer

### Changed
- **Architecture**: Search result cache appropriately placed in UI layer (`token-image-replacement.js`)
  - Cache manager (`manager-image-cache.js`) focuses on file system and persistent storage
  - Matching manager (`manager-image-matching.js`) remains stateless algorithm logic
  - Window (`token-image-replacement.js`) handles UI orchestration and performance caching

### Technical
- Added `_generateSearchCacheKey()` for unique cache key generation
- Added `_getCachedSearchResults()` with TTL expiration checking
- Added `_cacheSearchResults()` with LRU eviction strategy
- Added `_invalidateSearchCache()` called on filter/tag/category changes
- Added `_enhanceFileTagsPostCategorization()` to pre-compute all tags during cache build
- Added performance logging (`console.time/timeEnd`) for search operations

---

## [12.1.16] - Token Image Replacement Fixes and Code Cleanup

### Fixed
- **Category Tooltips Showing 0 Counts:** Fixed category buttons displaying incorrect file counts
  - Root cause: Cache was storing files with empty `path` properties
  - Solution: Updated all filtering methods to extract relative paths from `fullPath` when `path` is empty
  - Applied fix to `_countFilesInCategory()`, `_getFilteredFiles()`, `_getAggregatedTags()`, `_getTagsForMatch()`, and `_getTagsForFile()`
  - Category tooltips now show correct file counts

- **Selected Tab Not Showing Results:** Fixed selected tab filtering to 0 results when token is selected
  - Root cause: Same empty `path` property issue affecting file matching
  - Solution: Updated selected tab filtering logic to properly extract relative paths
  - Selected tab now correctly shows matching files based on token characteristics

- **Favorites Tab Not Showing Actual Favorites:** Fixed favorites tab showing tags but no actual favorited files
  - Root cause: `_getFileInfoFromCache()` was looking up files by empty `fileName` strings
  - Solution: Use file objects directly from cache iteration instead of re-lookup by name
  - Favorites tab now correctly displays all favorited files (ignoring relevance)

- **Tag Display Issues:** Fixed aggregated tags not showing correctly in category and selected modes
  - Root cause: Inconsistent path handling between category discovery and file filtering
  - Solution: Unified path extraction logic across all tag-related methods
  - Tags now display correctly for all filter modes (All, Selected, Favorites, Categories)

### Changed
- **Eliminated Hardcoded Path Assumptions:** Removed all hardcoded folder name assumptions from tag system
  - Replaced hardcoded `ignoredFolders` array with dynamic retrieval from `tokenImageReplacementIgnoredFolders` setting
  - Replaced hardcoded path depth assumptions and `FA_Tokens_Webp` checks with dynamic logic using `tokenImageReplacementPath` setting
  - Module now adapts to any user folder structure without requiring specific naming conventions

- **Code Organization:** Improved separation of concerns in token image replacement system
  - Moved dead token management functions to `token-image-utilities.js` for better organization
  - Updated `ImageCacheManager` to use dynamic category discovery instead of hardcoded categories
  - Added `getDiscoveredCategories()` and `getCategoryFromFilePath()` methods for flexible path handling

### Technical Improvements
- **Dynamic Category Discovery:** Categories are now derived from actual cache data instead of hardcoded assumptions
  - `ImageCacheManager.getDiscoveredCategories()` dynamically discovers top-level categories from `cache.folders`
  - Respects user settings for ignored folders and base path configuration
  - Categories automatically adapt to user's folder structure

- **Consistent Path Handling:** Unified path interpretation across all filtering and tagging methods
  - All methods now consistently use relative paths for category determination
  - Proper fallback from `file.path` to extracted relative path from `file.fullPath`
  - Eliminated inconsistencies between cache storage format and usage patterns

### Code Cleanup
- **Removed Debug Logging:** Cleaned up excessive debug logging that was causing console spam
  - Removed 46,000+ debug log entries that were cluttering console output
  - Kept essential logging for troubleshooting while removing verbose iteration logs

- **TODO List Maintenance:** Cleaned up and reorganized TODO.md for better tracking
  - Removed completed items to focus on active tasks
  - Removed priority numbers and icons for cleaner presentation
  - Marked "Targeted Indicators" as completed
  - Confirmed "HookManager Return Value Handling" was already fixed

### Performance
- **Reduced Memory Usage:** Eliminated unnecessary file lookups in favorites filtering
  - Direct file object usage instead of cache re-lookup reduces function call overhead
  - More efficient filtering logic for large image collections


## [12.1.15] - Memory Leak Fix

### Fixed
- **CRITICAL: Memory Leak (7.9GB RAM Usage):** Fixed catastrophic memory leak causing browser crashes
  - Eliminated temporary window instance creation in `_findBestMatch()` - was creating thousands of full window instances
  - Added static scoring methods to prevent window instance accumulation
  - Fixed unbounded `allMatches` array growth with duplicate detection and 2000 result limit
  - Added comprehensive memory cleanup on window close (arrays, images, event listeners)
  - Explicitly clear image `src` attributes to release decoded image data from browser memory
  - Cancel ongoing searches and timeouts on window close
  - Expected memory usage reduced from 7.9GB+ to under 500MB for 11k+ image cache

- **Category Filter Tabs Broken:** Fixed all category filters returning 0 results
  - Fixed path parsing logic to handle both relative (`Adventurers/...`) and full path formats
  - Applied fix to 3 locations: `_getFilteredFiles()`, `_getAggregatedTags()`, and `_findBestMatch()`
  - Category tabs (Adventurers, Adversaries, Creatures, NPCs) now work correctly

### Changed
- **Result Limits:** Implemented maximum 2000 results per search to prevent memory exhaustion
  - Search stops automatically when limit reached with console notification
  - Duplicate results are now filtered before adding to prevent accumulation

## [12.1.14] - 2025-01-19

### Fixed
- **Cache Validation Bug:** Resolved critical issue where server-side cache was saved successfully but failed validation on load
  - Cache data contained `creatureType` (singular) but validation looked for `creatureTypes` (plural)
  - Added support for both `creatureType`, `creatureTypes`, and compressed `ct` property names
  - Cache validation now handles all property name variations correctly
  - Fixed cache loading after refresh on Molten hosting environments

- **Emergency Cache Recovery:** Fixed cache loading that was incorrectly rejecting valid 3.11MB cache data
  - 11,568 files, 100 folders, and 12 creature types now load successfully
  - Eliminates need to rescan after browser refresh
  - Ensures 29+ minute scan sessions are preserved across sessions

### Changed
- **Cache Property Validation:** Enhanced cache validation to handle multiple property name formats
  - Supports `creatureType` (singular), `creatureTypes` (plural), and `ct` (compressed)
  - Maintains backward compatibility with all existing cache formats
  - More robust validation prevents false cache invalidation

## [12.1.13] - 2025-01-19

### Added
- **Server-Side Cache Storage:** Implemented game.settings-based cache storage for hosted environments
  - Cache now saves to server-side game.settings instead of browser localStorage
  - Persists across browser refreshes and different client connections
  - Compatible with Molten Hosting and other remote FoundryVTT servers
  - Shared cache across all GMs and players in the world
  - Maintains all existing compression and streaming benefits

- **Enhanced Cache Persistence:** Added robust server-side cache management
  - Incremental saves during scan process to preserve progress
  - Final save with complete fingerprint for validation
  - Automatic fallback and validation for cache integrity
  - Console commands updated to show server-side cache status

### Fixed
- **Molten Hosting Cache Loss:** Resolved critical issue where cache was lost on browser refresh
  - localStorage was browser-specific and not persisting on remote servers
  - Cache now stored in world database via game.settings
  - Survives server restarts and browser session changes
  - Works seamlessly across different devices and browsers

- **Cross-Client Cache Sharing:** Fixed issue where cache was isolated per browser session
  - All players and GMs now share the same cached token data
  - No need to rescan when switching devices or browsers
  - Consistent token replacement experience for all users

### Changed
- **Cache Storage Location:** Migrated from localStorage to game.settings
  - Primary storage now in server database (persistent across sessions)
  - Maintains backward compatibility with existing cache format
  - All console commands updated to reflect server-side storage
  - Cache size and compression benefits retained

- **Cache Loading Logic:** Updated to prioritize server-side cache over localStorage
  - Loads from game.settings first, falls back to localStorage if needed
  - Validates cache integrity and version compatibility
  - Clear messaging about cache source (server vs. browser)

## [12.1.12] - Cache Compression

### Added
- **Streaming Cache Compression:** Implemented memory-efficient cache compression system to solve localStorage quota issues
  - Builds compressed cache data without creating full JSON objects in memory
  - Reduces cache size by 40-60% through property name shortening and whitespace removal
  - Handles large token collections (10,000+ files) without quota exceeded errors
  - Backward compatible with existing cache format

- **Enhanced Console Commands:** Added comprehensive cache debugging tools
  - `coffeePubCache.info()` - Display cache statistics (files, folders, creature types, scan status)
  - `coffeePubCache.size()` - Show compressed vs uncompressed cache size with compression ratio
  - `coffeePubCache.version()` - Display cache version and basic information
  - `coffeePubCache.clear()` - Clear cache from localStorage
  - `coffeePubCache.quota()` - Test localStorage quota availability

- **Cache Size Display:** Added cache storage size to UI status display
  - Shows actual localStorage footprint alongside file count and age
  - Updates dynamically when cache changes
  - Format: "1969 files, 0.8 hours old, 0.53MB"

### Fixed
- **localStorage Quota Exceeded:** Resolved critical issue where large token collections (8.64MB+) failed to save
  - Streaming compression prevents memory issues during cache building
  - No longer hits browser localStorage limits (typically 5-10MB)
  - Cache now saves successfully for collections with 10,000+ files

- **Cache Save Reliability:** Improved cache persistence during long scans
  - Streaming compression reduces save failures
  - Better error handling for storage quota issues
  - Fallback mechanisms if compression fails

### Changed
- **Cache Storage Format:** Optimized internal cache structure for better compression
  - Shortened property names (e.g., "fullPath" → "fp", "fileName" → "fn")
  - Removed unnecessary whitespace from JSON structure
  - Maintains full backward compatibility with existing caches

- **Save Progress Messages:** Updated cache save notifications to show actual compressed size
  - Clear indication of storage footprint: "Cache saved: 0.53MB (1969 files)"
  - Removed misleading compression ratio estimates
  - More accurate reporting of actual storage usage


## [12.1.11] - Token Image Replacement Enhancements

### Added
- **3-State Tag Filter Toggle:** Enhanced tag sorting with three modes:
  - Count mode: Sort tags by frequency (default)
  - Alpha mode: Sort tags alphabetically
  - Hidden mode: Completely hide tag container
  - Visual feedback with distinct icons for each mode (fa-filter, fa-filter-list, fa-filter-circle-xmark)
  - Persistent mode selection across sessions

- **Ignored Words Filter:** Added powerful file exclusion system with wildcard support:
  - Completely excludes matching files from cache scanning
  - Supports multiple wildcard patterns: exact match, starts with (*word), ends with (word*), contains (*word*)
  - File extension filtering (e.g., *.png, *.jpg)
  - Tracks and reports ignored file count in scan completion messages
  - Significantly reduces cache size for large token collections

### Fixed
- **Automatic Cache Updates:** Fixed automatic update system to use incremental scans instead of full scans when changes are detected
  - Automatic updates now properly call `_doIncrementalUpdate()` instead of `_scanFolderStructure()`
  - Much faster update performance when "Automatically Update Image Cache" is enabled
  - Preserves existing cache data during automatic updates

- **Folder Count Display:** Fixed completion message to show accurate number of scanned folders
  - Added `totalFoldersScanned` property to track actual non-ignored directory count
  - Completion messages now display correct folder count instead of only folders containing files

### Changed
- **Debug Logging Cleanup:** Converted internal progress and processing messages to debug-only mode
  - Reduced console noise during normal operation
  - Critical errors and user-facing messages remain visible
  - Improved debugging experience with properly flagged messages



## [12.1.10] - Character Import System and Enhanced Cache Size Monitoring

### Added
- **Character Import System:** Added comprehensive character import system with advanced properties:
  - Character type configuration (npc, player, monster)
  - Currency configuration with type and amount
  - Feature configuration with name and description
  - Spell configuration with name and description

### Added
- **Enhanced Cache Size Monitoring:** Added automatic size monitoring with warnings when cache approaches localStorage limits (8MB threshold)
  - Automatic fallback logic: File → localStorage quick cache → old localStorage format → rebuild
  - Cache directory auto-creation and management
  - Seamless migration from old localStorage-only format to hybrid system

### Fixed
- **CRITICAL: Token Image Cache System:** Fixed multiple critical bugs causing cache data loss and scan failures:
  - Error handling now saves partial cache with proper fingerprint even when scans fail
  - Incremental updates properly handle null/invalid fingerprints instead of infinite rescan loops
  - Finally block ensures cache status updates and UI renders correctly after errors
  - Enhanced fingerprint validation detects and handles `null`, `'error'`, and `'no-path'` states gracefully
  - Added comprehensive error logging with stack traces, cache diagnostics, and storage quota details
  - Cache now persists reliably even when scan errors occur, preventing loss of incremental progress
  - Enhanced localStorage cache with size monitoring and quota exceeded protection
  - Cache survives browser cache clearing and module updates

## [12.1.9] - Menu Bar System and Enhanced Consumable Item Import System

### Added
- **Menu Bar System:** Introduced a comprehensive menu bar for quick access to module features:
  - Current combatant display with portrait, name, HP, and conditions
  - Party leader display with initiative and status
  - Quick access buttons for frequently used tools
  - Configurable visibility and position settings
  - Real-time updates during combat
- **Simplified Item Import Options:** Streamlined item import dropdown to two clean options: "Loot" and "Consumables"
- **Enhanced Consumable Item Support:** Added comprehensive consumable item import with advanced properties:
  - Consumable type configuration (ammunition, food, poison, potion, rod, scroll, trinket, wand)
  - Magical property detection and attunement requirements
  - Usage tracking with spent/max uses and auto-destroy behavior
  - Recovery system with configurable periods (Long Rest, Short Rest, Day, etc.)
- **Activity System Integration:** Implemented full activity support for consumable items:
  - Multiple activities per item (Heal, Attack, Cast, Check, Damage, etc.)
  - Activity-specific effect configuration with dice formulas
  - Chat flavor text for activity descriptions
  - Proper FoundryVTT activity data structure with unique IDs
- **RollTable Import Utility:** Added comprehensive rolltable import system with multiple result types:
  - Text results with descriptions and weights
  - Document results linking to world actors/items with automatic matching
  - Compendium results with collection references
  - Support for "Draw with Replacement" and "Display Roll Formula" settings
- **Dynamic Prompt Generation:** Enhanced prompt templates with placeholder replacement:
  - Campaign name and rulebooks integration across all prompts
  - Dynamic actor lists for "Document: Actor" rolltables
  - Dynamic item lists for "Document: Item" rolltables
  - Automatic placeholder substitution during template copying

### Fixed
- **Consumable Property Mapping:** Fixed magical property detection using correct FoundryVTT field names (`properties.mgc`)
- **Activity Effect Configuration:** Resolved healing effect field mapping to use proper HTML field names:
  - `healing.number` for dice count
  - `healing.denomination` for die type (converted from "d8" to "8")
  - `healing.bonus` for bonus values
  - `healing.types` for effect type selection
- **Recovery System Validation:** Fixed recovery formula validation errors by using numeric values instead of text descriptions
- **RollTable Document Type Assignment:** Corrected document type assignment for rolltable results using proper field names (`documentCollection`)
- **Activity ID Generation:** Fixed activity ID format to meet FoundryVTT's 16-character alphanumeric requirements

### Changed
- **Unified Prompt Structure:** Consolidated item prompts to include both JSON and image generation instructions in single files
- **Enhanced Field Support:** Expanded consumable item fields to support all FoundryVTT consumable properties:
  - `consumableType`, `consumptionMagical`, `magicalAttunementRequired`
  - `limitedUsesSpent`, `limitedUsesMax`, `destroyOnEmpty`
  - `recoveryPeriod`, `recoveryAmount` (auto-calculated)
- **Improved Error Handling:** Enhanced validation and error handling throughout the import system
- **Scalable Activity Architecture:** Designed activity system to support multiple activity types with proper effect configuration

### Technical Details
- Updated `parseFlatItemToFoundry()` function with comprehensive consumable item support
- Implemented `parseTableToFoundry()` function for rolltable data conversion
- Added helper functions for world actor/item list generation
- Enhanced placeholder replacement system with `getTablePromptWithDefaults()`
- Fixed FoundryVTT data structure compliance for all imported item types



## [12.1.8] - Beginning of migration to version 13

### New
- **Modified Compatability**: Mod now on track to support FoundryVTT version 13

## [12.1.7] - XP Distribution System Complete Overhaul

### Added
- **Dual-Mode XP System:** Implemented independent Experience Points and Milestones modes
  - Experience Points mode: Monster-based XP calculation with resolution types
  - Milestones mode: Manual XP input with category, title, and description fields
  - Both modes can be active simultaneously with combined XP totals
  - Toggle controls for each mode with proper UI visibility management
- **Menubar Integration:** Added XP Distribution tool to GM Tools section of menubar
  - Accessible via "GM Tools" → "XP Distribution" button
  - Works independently of combat tracker - no active combat required
  - Integrates with existing menubar API and tool registration system
  - Maintains consistent UI/UX with other menubar tools
- **Non-Combat XP Distribution:** Added XP distribution window accessible from GM Tools menubar
  - Works without active combat by loading all canvas monsters
  - Defaults to "Removed" status for all monsters in non-combat mode
  - Maintains full monster data for dynamic resolution changes
  - Defaults to Milestones mode ON, Experience Points mode OFF when no combat active
- **Enhanced Monster Resolution System:** Expanded resolution types with proper multipliers
  - Defeated (1.00x), Escaped (0.60x), Captured (1.20x), Negotiated (1.50x), Ignored (0.20x), Removed (0.00x)
  - Visual resolution icons with tooltips and multiplier display
  - Real-time XP calculation updates as resolutions change
- **Player Adjustment Controls:** Added intuitive plus/minus buttons for individual player XP adjustments
  - Visual +/- buttons replace confusing input-only system
  - Error trapping prevents negative XP (rounds to 0)
  - Maintains existing player inclusion/exclusion functionality
- **Sticky Footer Layout:** Implemented proper flexbox layout for XP distribution window
  - Sticky header, scrollable middle content, sticky footer
  - Action buttons always visible at bottom regardless of window size
  - Responsive design that works at any window height

### Fixed
- **XP Calculation Discrepancies:** Resolved circular dependency bug in XP calculations
  - Fixed stale data issues where monster resolution changes didn't update totals
  - Unified player data loading between combat and non-combat modes
  - Ensured consistent XP calculations across all entry points
- **Character HP Corruption:** Fixed critical bug causing character death after XP distribution
  - Removed problematic `diff: false` and `recursive: false` flags from actor updates
  - Prevented infinite reactivity loops in FoundryVTT's actor update system
  - Characters now maintain proper HP values after XP distribution and browser refresh
- **Player Level Display:** Fixed missing player levels in combat mode
  - Unified player data structure between combat and non-combat entry points
  - Ensured consistent level information display across all modes
- **Monster Base XP Calculation:** Fixed CR-to-XP conversion for fractional challenge ratings
  - Converted CR table to use decimal keys (0.5, 1.5, etc.) instead of string keys
  - Added proper CR conversion helper for accurate XP calculations
  - Fixed "CR 0.5 monsters showing 0 XP" issue
- **Chat Card Display Logic:** Enhanced XP distribution results chat card
  - Filters out "REMOVED" monsters from display
  - Conditionally shows Experience Points and Milestones sections based on enabled modes
  - Fixed "LEVEL UP!" display for players with negative `nextLevelXp`
  - Shows total XP and XP to next level instead of just XP gained
- **Milestone Data Persistence:** Fixed milestone form data not appearing in chat card
  - Properly collects category, title, and description from form inputs
  - Uses direct jQuery `.val()` access instead of FormData (no form tag in template)
  - Ensures milestone data is captured before XP distribution

### Improved
- **UI/UX Consistency:** Standardized styling and layout across XP distribution interface
  - Consistent label styling with `class="label"` for all form elements
  - Side-by-side layout for milestone Experience Points input and Category select
  - Proper spacing and alignment for all form elements
  - Unified CSS targeting with data attributes instead of class-based selectors
- **Error Handling:** Enhanced robustness throughout XP distribution system
  - Added comprehensive error trapping for negative XP values
  - Improved actor update error handling with proper try-catch blocks
  - Added validation for player data before processing
  - Graceful handling of missing or invalid actor references
- **Performance Optimization:** Streamlined XP calculation and update processes
  - Removed unnecessary re-rendering on mode toggle changes
  - Implemented efficient jQuery show/hide instead of full template re-rendering
  - Optimized event handling to prevent duplicate calculations
  - Reduced console logging overhead in production

### Technical Improvements
- **Code Architecture:** Refactored XP distribution system for maintainability
  - Centralized XP calculation logic in `updateXpCalculations()` method
  - Unified player data loading with `loadPartyMembers()` static method
  - Separated concerns between data collection, calculation, and display
  - Improved method organization and reduced code duplication
- **Data Structure Consistency:** Standardized XP data object structure
  - Consistent player data format across combat and non-combat modes
  - Proper initialization of milestone data structure
  - Unified monster data format with all required fields
  - Eliminated data structure mismatches between different entry points



## [12.1.6] - Token Image Replacement System Enhancements

### Added
- **Favorites System:** Added comprehensive favorites functionality for token images
  - New "Favorites" filter tab in the category filters (left of "Selected")
  - Right-click any image thumbnail to favorite/unfavorite it
  - Favorites are stored persistently in the image cache metadata
  - Favorites filter shows only favorited images plus original/current image cards when token is selected
- **Visual Favorites Indicators:** Added heart icon badges for favorited images
  - Red heart icon appears in top-left corner of favorited image thumbnails
  - Clean design without background circle, matching other UI favorites styling
  - Heart icon has dark shadow for visibility against light backgrounds

### Fixed
- **Cache Completion Notifications:** Fixed multiple issues with cache scanning completion
  - "Delay Cache" button now properly changes back to "Scan for Images" when scan completes
  - In-window notification now shows completion status instead of scanning status
  - Added detailed completion data showing files found, folders scanned, and scan duration
  - Fixed incremental scans not completing gracefully in the UI
- **Progress Bar Issues:** Fixed "Phase 5 of 6" progress bar anomaly for large directories
  - Removed phantom 6th step that was causing progress bar to get stuck
  - Added progress validation to ensure completion state is properly triggered
  - Added timeout protection (3 hours) for long-running scans to prevent indefinite hanging
- **Player Character Support:** Fixed window dimming issue when selecting player characters
  - Added proper error handling to hide search spinner overlay on token selection errors
  - Enhanced token data extraction to handle player character data structure
  - Added type checking for potentially undefined properties before calling string methods
  - Player characters now default to 'humanoid' creature type, use race/ancestry for subtype, class for background, and 'medium' size
- **Original Image Preservation:** Fixed original image storage when applying images from the window
  - Original token image is now saved before applying new image (only if original doesn't already exist)
  - Maintains consistency with drop-to-apply behavior
  - Ensures original image can always be restored

### Improved
- **Cache Management:** Enhanced cache scanning with better error handling and completion detection
  - Added completion state tracking with `justCompleted` and `completionData` fields
  - Improved UI state management to prevent race conditions between scanning and completion
  - Added safety mechanisms for long-running operations
- **Token Data Extraction:** Improved robustness of token data parsing
  - Added comprehensive type checking for all string operations
  - Better handling of different actor data structures (NPCs vs Player Characters)
  - More reliable search term generation for better image matching
- **Favorites Integration:** Seamlessly integrated favorites with existing tag system
  - Favorites use the existing metadata tag system for consistency
  - Favorites filter works like other category filters (not as a hack)
  - Original and current image cards always show when token is selected, regardless of filter

### Technical Details
- Updated `scripts/token-image-replacement.js` with comprehensive favorites functionality
- Enhanced `templates/window-token-replacement.hbs` with favorites filter button
- Updated `styles/window-token-replacement.css` with clean favorites styling
- Fixed case sensitivity issues in cache file lookups (files stored with lowercase keys)
- Improved error handling and debugging throughout the image replacement system


## [12.1.5] - Token Movement System Enhancements

### Fixed
- **Token Movement Locking:** Fixed critical issue where players could still move tokens even when movement was set to "locked" mode
- **HookManager Return Value Handling:** Modified HookManager to properly handle return values from `preUpdateToken` hooks, allowing movement restrictions to actually block token updates
- **Movement Restriction Enforcement:** Players now receive warning messages AND movement is properly blocked when in "no-movement" mode

### Technical Details
- Updated `scripts/manager-hooks.js` to capture and respect return values from `preUpdateToken` hook callbacks
- When any `preUpdateToken` callback returns `false`, the entire hook chain now returns `false` to block the action
- This ensures FoundryVTT properly respects movement restriction settings

### TODO
- **HookManager Priority System:** Consider implementing proper priority-based execution order for hook callbacks (currently hooks run in registration order, not priority order)
- **Comprehensive Hook Testing:** Test all hook types to ensure the return value handling doesn't break other functionality


## [12.1.4] - Token Image Replacement System Enhancements

### Added
- **Original Image Tracking:** Tokens now store their original image when first dropped, allowing users to revert to the initial image
- **Original Image Card:** Added "Original Image" card as the first result in the Token Image Replacement window with purple styling
- **Double-Middle-Click Support:** Double-middle-click on any token to instantly open the Token Image Replacement window with that token selected
- **Update Dropped Tokens Setting:** New world setting to control whether tokens are automatically updated when dropped on the canvas
- **Fuzzy Search Toggle:** New toggle for manual search box input - when enabled, searches for individual words independently
- **Threshold Display Enhancement:** Moved threshold percentage from slider to label for better readability (e.g., "Matching Threshold 32%")
- **Current Image Tag:** Added "CURRENT IMAGE" tag to clearly identify the currently selected token's image

### Fixed
- **Duplicate Object Key:** Removed duplicate "kobold" entry from monster-mapping.json that was causing JSON parsing errors
- **Selected Token Card Visibility:** Fixed issue where selected token card would disappear when relevance score was below threshold
- **Current Image Tag Display:** Fixed "CURRENT IMAGE" tag not appearing consistently for selected tokens
- **Scoring Algorithm:** Improved relevance scoring calculation for more accurate image matching (Brown Bear now scores 55%+ instead of 15%)
- **Results Blanking:** Fixed window results being cleared after applying an image to a token - now properly refreshes
- **Fuzzy Search Scope:** Corrected fuzzy search to only apply to manual search box input, not automatic token matching
- **Original Image Persistence:** Fixed original image data to be stored in token flags for persistence across sessions
- **Memory Leaks:** Fixed potential memory leaks with proper event listener cleanup and HookManager usage
- **TypeError in Token Context:** Fixed TypeError when metadata fields are not strings in `_calculateTokenContextBonus`

### Changed
- **Image Application Flow:** After applying an image, the window now closes for a cleaner user experience
- **Token Selection Detection:** Added global token selection hook to detect token changes system-wide
- **Scoring System:** Restored user-configurable weights for more accurate and customizable scoring
- **Debug Logging:** Removed excessive debug logging that was slowing down search performance
- **Window Refresh Logic:** Simplified window refresh to use the same code path as the toolbar button

### Technical Details
- Implemented `_storeOriginalImage()` and `_getOriginalImage()` methods using token flags for persistence
- Added `_addMiddleClickHandler()` with proper cleanup via `_removeMiddleClickHandler()`
- Enhanced `_sortResults()` to prioritize original images first, then current images
- Updated `_applyImageToToken()` to close window after successful image application
- Fixed `_getTagsForMatch()` to handle original images without metadata
- Improved `_calculateRelevanceScore()` with better maxPossibleScore calculation
- Added proper memory management with HookManager integration



## [12.1.3] - NEW Token Image Replacement System

### Added
- **Token Image Replacement System:** Complete token image replacement functionality with automatic matching and manual selection
- **Dual Use Case Support:** Separate logic for automatic replacement (best match) vs manual selection (all matches)
- **Token Image Replacement Window:** Dedicated UI window for GMs to manually select token images from available alternatives
- **Cache Management System:** Comprehensive image caching with incremental updates, pause/resume, and storage persistence
- **CoffeePub Toolbar Integration:** Added Token Image Replacement button to CoffeePub toolbar for easy access
- **Progress Tracking:** Real-time progress bars showing scan status with detailed folder and file information
- **Smart Cache Updates:** Incremental update system that only rescans when folder structure changes
- **Confirmation Dialogs:** User-friendly dialogs for scan type selection (Incremental Update vs Full Rescan vs Cancel)
- **Token Selection Detection:** Automatic detection of currently selected tokens when window opens
- **Multiple Match Display:** Shows up to 11 alternative images plus current image (12 total) in thumbnail grid
- **Current Image Highlighting:** Green checkmark and border to identify the currently assigned token image

### Fixed
- **Cache Age Calculation:** Fixed incorrect cache age display (was showing 488,232 hours instead of reasonable values)
- **Cache Persistence:** Resolved cache being cleared on every client reload
- **SUPPORTED_FORMATS Context:** Fixed undefined errors in folder fingerprinting and file processing
- **Search Threshold:** Lowered matching threshold from 0.5 to 0.3 for better match detection
- **Multiple Match Display:** Fixed window showing only 1 match instead of all available alternatives
- **Infinite Render Loop:** Prevented Foundry crashes caused by render loop issues
- **Automatic Scanning Bypass:** Fixed scans starting even when auto-update setting was disabled
- **FilePicker Scope:** Corrected FilePicker.browse calls to use 'data' instead of 'public' scope
- **Incremental Cache Processing:** Ensured files are added to cache immediately during scanning
- **Token Selection Hook:** Fixed token selection not working when window opens with token selected

### Changed
- **Cache Management:** Replaced confusing cache settings with single "Automatically update image cache" checkbox
- **Dialog Buttons:** Updated scan confirmation dialog with proper button labels (Incremental Update, Full Rescan, Cancel)
- **Search Algorithm:** Enhanced matching algorithm to find multiple alternatives for manual selection
- **Progress Display:** Improved progress bar text with detailed folder paths and file counts
- **Cache Storage:** Implemented incremental saves during long scans to prevent data loss
- **Error Handling:** Enhanced error handling with detailed logging and user notifications

### Technical Details
- Implemented `TokenImageReplacement` class with comprehensive cache management
- Added `TokenImageReplacementWindow` for manual token image selection
- Created `_doIncrementalUpdate()` method for efficient cache updates
- Enhanced `_findMatches()` method to display all alternatives for manual selection
- Fixed `_saveCacheToStorage()` to handle incremental saves properly
- Updated `_generateFolderFingerprint()` to use correct FilePicker scope
- Implemented proper hook registration/unregistration for token selection
- Added comprehensive debugging and logging throughout the system

## [12.1.2] - NEW Toolbar Manager

### Added
- **Dynamic Toolbar System:** Implemented comprehensive toolbar management system with dynamic tool registration and zone-based organization
- **Zone System:** Added 6 predefined zones (general, rolls, communication, utilities, leadertools, gmtools) for logical tool grouping and visual organization
- **Three-Tier Visibility System:** Implemented GM/Leader/Player visibility controls with proper permission checking
- **Token Toolbar Integration:** Added Request Roll tool to Foundry's default token control toolbar alongside existing tools
- **Toolbar Settings:** Added client-side settings for toolbar dividers and labels with proper scope management
- **Leader System Integration:** Integrated party leader detection with toolbar visibility and vote system
- **CSS Zone Styling:** Added `toolbar-zones.css` with zone-specific background colors and visual dividers
- **Toolbar Refresh Logic:** Implemented automatic toolbar refresh when party leader changes or settings update
- **External Module API:** Exposed comprehensive toolbar API for external modules to register custom tools
- **Utility Function Exposure:** Added 11 utility functions to API (getActorId, getTokenImage, getPortraitImage, getTokenId, trimString, toSentenceCase, objectToString, stringToObject, convertSecondsToRounds, convertSecondsToString, clamp)
- **OpenAI API Separation:** Refactored OpenAI functionality into dedicated `api-openai.js` with improved error handling and validation
- **Model Support Update:** Added support for latest OpenAI models (GPT-5, GPT-4o, GPT-4o-mini, O1 models) with updated pricing calculations
- **Session Memory System:** Implemented persistent conversation memory with session-based context management for AI interactions
- **Persistent Storage:** Added localStorage-based memory persistence that survives page refreshes and FoundryVTT restarts
- **OpenAI Projects Support:** Added optional OpenAI Projects integration for better cost tracking and team management
- **API Documentation:** Created complete API documentation with examples for all exposed functions

### Changed
- **Consolidated Architecture:** Merged separate `BlacksmithToolbarManager` class into `manager-toolbar.js` for simplified management
- **Tool Registration:** Migrated from hardcoded tool arrays to dynamic `Map`-based registration system
- **Vote System Integration:** Updated vote manager to use consistent leader detection logic across all systems
- **Leader Detection:** Improved party leader detection with timing safeguards and setting availability checks
- **Toolbar Hooks:** Enhanced `getSceneControlButtons` hook to support both Blacksmith and Foundry toolbars

### Fixed
- **Visibility Logic Bug:** Fixed `else if` structure in token toolbar visibility checking to prevent overrides
- **Leader Timing Issues:** Resolved party leader detection timing problems during initial load
- **Vote Permissions:** Fixed vote system to allow leaders to start regular votes (not leader votes)
- **Toolbar Refresh:** Added delayed refresh mechanism to ensure settings are loaded before toolbar rendering
- **Duplicate Prevention:** Added checks to prevent duplicate tools in token toolbar
- **Setting Registration:** Fixed toolbar settings registration timing and scope issues

### Technical Details
- **Tool Data Structure:** Enhanced tool objects with `zone`, `order`, `gmOnly`, `leaderOnly` properties
- **Hook Management:** Added `settingChange` hook for automatic toolbar refresh on leader changes
- **Error Handling:** Improved error handling for missing settings and invalid tool registrations
- **Performance:** Optimized tool lookup and rendering with efficient Map-based storage
- **Documentation:** Updated `architecture-toolbarmanager.md` with complete implementation details


## [12.1.1] - BREAKING PATCH

### Fixed
- **Missing Files:** forgot to add some files to the release.

## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Module-Specific Release Naming:** Updated release workflow to create `coffee-pub-blacksmith.zip` instead of generic `module.zip` for better module identification and management.
- **Unified Header System:** Created `partial-unified-header.hbs` template for consistent header styling across skill check dialog and roll window
- **Actor Portrait Support:** Added actor portrait display in roll window header next to actor name
- **Real-Time Formula Updates:** Added live formula updates when situational bonus or custom modifier changes, with blue text highlighting modifications
- **Roll Mode Visibility System:** Implemented comprehensive roll mode handling (Public, Private GM, Blind GM, Self Roll) with proper visibility controls in chat cards
- **Ownership-Based Controls:** Added ownership checks for roll buttons, disabling non-owner interactions with visual feedback
- **Chat Scrolling:** Added automatic chat scrolling to bottom when roll results are updated
- **Roll Request Sound:** Added sound notification when roll requests are posted to chat
- **Schema-Driven Roll Architecture:** Designed complete D&D 5e roll rules system with:
  - `dnd5e-roll-rules.js` - Pure JavaScript export of D&D 5e mechanics schema
  - `rules-service.js` - Singleton service for rule management, feature detection, and caching
  - `resolve-check-pipeline.js` - Ability check resolution with JOAT, Remarkable Athlete, and Reliable Talent
  - `resolve-save-pipeline.js` - Saving throw resolution with exhaustion, conditions, and cover
  - `resolve-attack-pipeline.js` - Attack roll and damage resolution with critical hits and fumbles
- **Comprehensive Documentation:** Updated `ARCHITECTURE-ROLLS.md` with complete schema-driven system design and implementation details

### Changed
- **Download URL Pattern:** Changed download URL from version-specific (`v12.1.0/module.zip`) to latest release pattern (`latest/coffee-pub-blacksmith.zip`), eliminating the need for manual URL updates before each release.
- **Release Workflow:** Updated GitHub Actions workflow to use module-specific zip naming and file references.
- **Roll Window Integration:** Updated roll window to use unified header template and pass actor portrait data
- **Formula Display Logic:** Enhanced formula display to show ability-specific modifiers instead of hardcoded "dex"
- **Custom Modifier Processing:** Improved custom modifier parsing to handle multiple values and prevent double plus signs
- **Roll Title Handling:** Fixed roll title passing from skill check dialog to roll window and chat cards
- **Template Structure:** Updated skill check and roll window templates to use consistent header layout and styling
- **Roll Calculation Accuracy:** Enhanced roll calculations to ensure 100% accuracy between displayed formula and actual roll execution

### Fixed
- **Manual Release Process:** Eliminated the requirement to manually update the download URL in `module.json` before each release. The `latest` tag now automatically redirects to the most recent release.
- **Hardcoded Ability References:** Fixed formula display to use dynamic ability keys instead of hardcoded "dex"
- **Custom Modifier Parsing:** Fixed double plus signs in custom modifier tooltips and formula display
- **Proficiency Calculation:** Fixed ability rolls to properly include proficiency bonus when character is proficient
- **Roll Title Consistency:** Fixed roll title display across skill check dialog, roll window, and chat cards
- **Chat Card Ownership:** Fixed ownership-based button functionality in chat cards
- **Template Rendering:** Fixed partial template loading errors and missing data passing
- **Math Accuracy:** Fixed roll calculation discrepancies between displayed formula and actual roll execution
- **Group Roll Logic:** Fixed group roll evaluation to properly honor the Group DC toggle setting
- **Roll Mode Processing:** Fixed roll mode selection to be properly passed through to roll execution

### Technical Details
- Implemented component-based roll evaluation system for accurate D&D 5e rule compliance
- Added feature detection from actor items and active effects for proficiency resolution
- Created caching system for rules and feature indexes to improve performance
- Enhanced error handling and validation throughout the roll system
- Improved socket communication for roll mode visibility and ownership controls
- Added comprehensive logging and debugging capabilities for roll system troubleshooting

## [12.0.23] - Suppress Combat Deployment from Players

### Fixed
- **Player Deployment Panel Access:** Fixed issue where the deployment panel (CODEX) was visible to players in journal entries. The entire deployment interface is now restricted to GMs only.
- **Deployment Panel Security:** Wrapped the complete deployment section in GM permission checks, preventing players from seeing:
  - DEPLOY section with deployment pattern and visibility settings
  - "Nothing to Deploy" messages
  - Deployment action buttons and monster/NPC icons
  - Deployment controls and settings
- **Canvas Information Visibility:** Maintained visibility of canvas information (Party CR, Monster CR, encounter difficulty) for all users while restricting deployment functionality to GMs only.

### Changed
- **Template Structure:** Restructured `encounter-toolbar.hbs` template to wrap the entire deployment interface in `{{#if isGM}}` conditional blocks.
- **Permission Enforcement:** Consolidated individual GM permission checks into comprehensive section-level protection for better security and maintainability.

## [12.0.22] - Quick Fix

### Fixed
- **Manifest:** Corrected the manifest download.

## [12.0.21] - Token Grid Positioning Fix

### Fixed
- **Token Grid Positioning:** Fixed token deployment to properly snap to grid square positions instead of grid intersections. All deployment patterns (line, circle, scatter, grid, sequential) now correctly place tokens within grid squares using the proper FoundryVTT coordinate system.

### Changed
- **Skill Roll Routing (DnD5e 4.4.4):** Updated skill check execution to use the DnD5e Actions API first (`game.dnd5e.actions.rollSkill`), with safe fallbacks to `rollSkillV2` and `doRollSkill`, and legacy `rollSkill` only as a last resort. This ensures v2 paths are used on 4.4.4 and prepares for removal of deprecated hooks in 5.0.

### Compatibility
- **Deprecation Warning Mitigation:** On DnD5e 4.4.4, skill checks now route through the v2 API to avoid triggering the deprecated `dnd5e.rollSkill` hook warning.

## [12.0.20] - Encounter Toolbar and Token Deployment

### NOTE: Bumped the version to 12 to align with the Foundry version.

### Added
- **Encounter Folder Support:** Added support for placing deployed actors in a configurable folder. When the `encounterFolder` setting is specified, actors are automatically placed in that folder. If the folder doesn't exist, it's created automatically. If the setting is empty, actors are placed in the root directory.
- **Enhanced Token Deployment Patterns:** Implemented multiple deployment patterns for encounter tokens:
  - **Circle Formation:** Tokens are placed in a circle around the deployment point
  - **Scatter Positioning:** Tokens are scattered in a spiral pattern to prevent overlaps with random variation
  - **Grid Positioning:** Tokens are placed in a proper square grid formation using scene grid size
  - **Sequential Positioning:** Tokens are placed one at a time with user guidance via tooltip
  - **Line Formation:** Default fallback pattern for backward compatibility
- **Unlinked Token Creation:** Deployed tokens are now created as unlinked copies instead of linked tokens, providing better flexibility for individual token management.
- **Lock Rotation Support:** Deployed tokens now honor the GM's default token rotation settings from Foundry core settings.
- **CR Badge System:** Added Party CR and Monster CR badges to the encounter toolbar:
  - **Party CR:** Calculates weighted party level using tiered formula (levels 1-4: 0.25x, 5-10: 0.5x, 11-16: 0.75x, 17-20: 1x)
  - **Monster CR:** Shows total CR of monsters currently deployed on the canvas
  - **Difficulty Badge:** Displays encounter difficulty with proper color coding
- **Encounter Template Import:** Added "Encounter" option to the JSON import dropdown, allowing users to copy encounter templates from `prompt-encounter.txt` for easy encounter creation.
- **Content Scanning:** Enhanced encounter detection to scan journal content for encounter data in JSON, markdown, and plain text formats when structured data attributes are not found.
- **Foundry UUID Support:** Updated content scanning to properly parse Foundry's @UUID[...]{...} format for monster references in journal entries.
- **Monster Name Resolution:** Added support for monster names in templates (e.g., "Death Knight", "Helmed Horror") with automatic lookup in available compendiums during deployment.
- **Pattern-Based Detection:** Completely redesigned encounter detection to use robust pattern matching instead of section-based parsing. Now detects @UUID patterns anywhere on the page, validates Actor types, and supports quantity indicators (x3, (3), etc.).
- **Journal Type Identification:** Maintains support for `data-journal-type="encounter"` as a quick identifier while ignoring deprecated `data-encounter-monsters` and `data-encounter-difficulty` attributes in favor of content scanning.
- **Monster Portraits:** Added monster portraits to the encounter toolbar instead of generic dragon icons, showing actual monster images with proper CR values.
- **Enhanced Retry Mechanism:** Improved content scanning reliability with multiple retry attempts (500ms, 1000ms, 2000ms) to handle timing issues when journal content loads after toolbar initialization.
- **Real-Time CR Updates:** Added real-time CR calculation updates when tokens are created, updated, or deleted on the canvas. CR badges now update automatically without requiring journal refresh.
- **Individual Token Deployment:** Added ability to deploy individual monsters and NPCs by clicking on their icons in the toolbar. Supports both single deployment and CTRL-click for multiple placement.
- **Multi-Placement Support:** Implemented CTRL key functionality for placing multiple instances of single tokens. Hold CTRL while clicking to place multiple copies, release CTRL to finish.
- **Invisible Token Deployment:** Added ALT key functionality to deploy tokens as invisible. Hold ALT while deploying to create hidden tokens for surprise encounters.
- **Token Visibility Toggle:** Added "Reveal Monsters" button to make hidden hostile NPC tokens visible on the canvas.
- **NPC and Monster Separation:** Separated NPCs and monsters into distinct sections in the toolbar display, with proper classification based on compendium source and disposition.
- **Deployment Cancellation:** Added right-click to cancel deployment during placement, with proper cleanup of event handlers and tooltips.
- **Partial Deployment Handling:** Added dialog prompt when combat creation is cancelled mid-deployment, allowing users to choose whether to create combat with partially deployed tokens.

### Fixed
- **Token Display Name Settings:** Fixed deployed tokens to honor the GM's core token display settings instead of prototype token settings. Tokens now properly use the GM's default name display mode (e.g., "anyone on hover" vs "never").
- **Actor Prototype Token Updates:** Fixed actor prototype tokens to be updated with GM's default settings when created from compendiums, ensuring subsequent drags from the actor tab also honor GM defaults.
- **Scatter Pattern Overlaps:** Fixed scatter deployment pattern to prevent token overlaps by using a spiral-based distribution with adequate spacing.
- **Grid Formation Issues:** Fixed grid deployment pattern to create proper square formations instead of single lines, using actual scene grid size for positioning.
- **Memory Leaks:** Fixed memory leaks in event handlers and socket communications to improve performance and prevent memory accumulation over time.
- **Debug Logging:** Optimized debug logging to reduce console noise and improve performance by using proper logging levels and conditional debugging.
- **Combat Token Addition:** Fixed issue where deployed tokens were not being added to combat encounters. Now properly tracks deployed tokens and adds them to existing or new combat encounters.
- **Double Deployment Issue:** Fixed issue where clicking "create-combat" button would deploy tokens twice. Consolidated deployment logic into single function used by both buttons.
- **Spell DC Deprecation Warning:** Updated CR calculation to use new DnD5e 4.3+ spell DC property path (`attributes.spell.dc`) with backward compatibility.
- **Encounter Template Placeholders:** Fixed encounter template copying to replace placeholders with settings values (campaign name, party details, etc.) like narratives do.
- **Encounter Settings:** Added new encounter default settings for folder and card image configuration.
- **Compendium Search Expansion:** Updated compendium search functions to support up to 8 monster and item compendiums (increased from 5).
- **Difficulty Badge Alignment:** Fixed "MEDIUM" difficulty badge to be left-aligned with the title instead of centered.
- **Party CR and Monster CR Display:** Ensured Party CR and Monster CR are always calculated and displayed, even when no explicit encounter data is found in the journal.
- **Permission Errors:** Fixed permission errors when players try to use features that require token updates (deployment, combat creation, token conversion, movement, token renaming). Added proper GM-only permission checks.
- **Multiple Journal Windows:** Fixed issue where having multiple journal windows open would cause multiple deployments and combat creations when clicking buttons. Event listeners are now properly scoped to individual toolbars.
- **Broken Monster Links:** Added logic to skip broken monster links (e.g., `class="content-link broken"`) during encounter detection.
- **CR Values Display:** Fixed CR values to display correct values instead of all 0s by implementing robust CR extraction from multiple actor system paths.
- **CR Badge Icon Removal:** Fixed issue where CR badge icons were being removed when updating CR values. Now preserves icons during updates.
- **ESC Key Cancellation:** Fixed ESC key functionality to properly cancel deployment without causing errors. Replaced with right-click cancellation for better user experience.
- **Sequential Deployment Cancellation:** Fixed error when cancelling sequential deployment that would cause "Cannot read properties of null" error. Added proper null checks for cancelled deployments.
- **Token Linking Honor:** Fixed hardcoded `actorLink = false` to honor the original actor's prototype token linked setting during deployment.
- **NPC Deployment Issues:** Fixed NPCs not being deployed and appearing in monster sections. Added proper NPC/monster classification and separate deployment handling.
- **Index Mismatch Errors:** Fixed issue where clicking on one monster icon would deploy a different monster due to DOM index mismatches. Now uses UUID-based identification.
- **UUID Validation:** Fixed UUID validation to properly handle world actors (non-compendium actors) during deployment.

### Changed
- **Deployment Pattern Setting:** Added `encounterToolbarDeploymentPattern` setting with options for circle, line, scatter, grid, and sequential positioning.
- **Deployment Hidden Setting:** Added `encounterToolbarDeploymentHidden` setting to control whether deployed tokens are hidden by default.
- **Real-Time Update Setting:** Added `enableEncounterToolbarRealTimeUpdates` setting to control whether CR badges update automatically when tokens change on the canvas.
- **Improved Token Positioning:** All deployment patterns now properly snap to the scene grid and use appropriate spacing based on grid size.
- **Enhanced Error Handling:** Added comprehensive error handling for folder creation and actor placement operations.
- **Toolbar Layout:** Redesigned encounter toolbar with title above buttons and badges, improved badge positioning and styling. Moved difficulty badge to canvas section for better organization.
- **Combat Creation Flow:** Updated "create-combat" button to deploy tokens first, then create combat with those tokens, ensuring proper token tracking.
- **Event Listener Scoping:** Updated event listeners to be properly scoped to individual toolbar containers, preventing cross-contamination between multiple journal windows.
- **Permission-Based UI:** Updated toolbar template to only show deployment and combat buttons for GMs, while still displaying monster icons and CR information to all users.
- **Deployment Controls:** Updated deployment controls to support CTRL for multiple placement and ALT for invisible deployment. Tooltips now show key combinations for user guidance.
- **Cancellation Method:** Changed deployment cancellation from ESC key to right-click to prevent interference with other open windows and dialogs.

### Technical Details
- Implemented proper merging of GM's `defaultToken` settings with actor prototype tokens using `foundry.utils.mergeObject`
- Added grid-aware positioning using `canvas.scene.grid.size` for accurate token placement
- Enhanced spiral-based scatter algorithm with random variation for natural-looking distributions
- Improved folder management with automatic creation and error recovery
- Added weighted party CR calculation using tiered level brackets for realistic encounter scaling
- Implemented canvas-based monster CR calculation for real-time encounter difficulty assessment
- Added permission checks to all token update operations: `_deployMonsters()`, `_createCombatWithTokens()`, `_createCombat()`, `_convertTokenToLoot()`, `_onCreateToken()`, `processNextFollower()`, `moveAllTokensOneStep()`
- Implemented proper event listener scoping using `toolbar.find()` instead of `$(document).find()` to prevent multiple journal window conflicts
- Added robust CR extraction from multiple actor system paths: `actor.system.details.cr.value`, `actor.system.details.cr`, `actor.system.cr`
- Enhanced content scanning with multiple fallback selectors and document-wide search for better reliability
- Implemented real-time CR updates using FoundryVTT hooks: `createToken`, `updateToken`, `deleteToken`, `settingChange`
- Added debouncing mechanism for CR updates to prevent performance issues during rapid token changes
- Implemented NPC/monster classification using heuristic-based logic (compendium source and disposition)
- Enhanced token deployment with key state detection (CTRL, ALT) and proper event handling for multiple placement modes
- Added UUID-based token identification to prevent DOM index mismatches during individual deployment
- Implemented proper token linking honor by preserving original actor's `prototypeToken.actorLink` setting

## [1.0.19] - Item Import and UI Improvements

### Added
- **Item Image Terms Array:** Added `itemImageTerms` array to item JSON for explicit control over image matching during imports, allowing precise synonym specification for image selection.
- **API Exposure:** Exposed `arrCOMPENDIUMCHOICES` in the Blacksmith API for other modules to access available compendium choices.

### Fixed
- **Item Import Logic:** Fixed image guessing logic to properly prioritize exact and partial synonym matches in item names first, then in descriptions, followed by loot type, filename, and fallback options.
- **Compendium Links:** Fixed compendium links during import to use UUIDs instead of simple references, ensuring links remain valid after import.
- **UI Underline Effects:** Removed underline effects and associated code from UI elements, relying on mouse pointer changes as sufficient visual cues.

### Changed
- **Image Matching Priority:** Improved item image matching to check `itemImageTerms` array first, then follow a clear hierarchy: item name exact/partial matches → description matches → loot type → filename → fallback options.

## [1.0.18] - Multiple Token Bug Fix

### Fixed
- **Token Name Display:** Skill check dialog and chat cards now use the token's name (e.g., "Sinolax (Troll)") instead of the actor's name (e.g., "Troll") for all contestant and result displays, making it easier to distinguish between multiple tokens of the same actor.
- **Multiple Token Roll Support:** Chat card roll buttons now correctly support rolling for multiple tokens of the same actor by matching both tokenId and actorId, ensuring each token instance is handled independently.
- **Improved User Clarity:** All skill check UI and chat card displays now reflect the actual token name, improving clarity for GMs and players when multiple similar tokens are present.
- **Token ID System:** Completely refactored skill check system to use token IDs instead of actor IDs for unique identification
- **Chat Card Roll Buttons:** Updated chat card roll buttons to work with individual token instances
- **Permission Handling:** Fixed permission checks to allow GMs to roll for any token while maintaining proper ownership checks for players
- **Actor Lookup:** Improved actor lookup logic with better error handling and debugging for token-to-actor resolution

### Changed
- **Data Structure:** Updated skill check message data to store both token ID (for unique identification) and actor ID (for roll operations)
- **Template Attributes:** Changed data attributes from `data-actor-id` to `data-token-id` for clarity
- **Socket Communication:** Updated socket handlers to work with token IDs for proper multi-token support

### Technical Details
- Changed `getData()` method to use `t.id` (token ID) instead of `t.actor.id` (actor ID)
- Updated all JavaScript methods to handle token ID to actor ID resolution
- Fixed chat card template to store both token and actor IDs
- Improved error handling for cases where tokens or actors might not be found

## [1.0.17] - Experience Points

### Added
- **XP Distribution Chat Card:** Introduced a new, visually distinct chat card to display XP distribution results, separate from the main XP window.
- **Dedicated CSS for XP Card:** Created a new stylesheet (`cards-xp.css`) and namespaced all classes to ensure consistent styling and prevent conflicts.

### Changed
- **XP Chat Card Layout:** Completely redesigned the chat card for improved clarity and aesthetics:
  - The **XP Summary** section now uses a clean, two-column layout.
  - The **Player Results** section has been updated to feature the character portrait, name, and new total XP on the left, with the XP gained aligned to the right.
  - The **Monster Resolutions** section now aligns all monster names and icons for a tidier list, with XP values aligned to the right.
- **Improved Data Formatting:** XP multipliers are now consistently formatted to two decimal places (e.g., 1.00) on all displays.

### Removed
- **Removed CR from Chat Card:** The monster Challenge Rating is no longer displayed on the XP chat card to reduce clutter.
- **Removed Legend from Chat Card:** The resolution types legend was removed from the chat card for a more streamlined look.

## [1.0.16] - Compendiums

### Added
- **Enhanced Compendium Mapping System**
  - Added support for up to 5 monster lookup compendiums (replacing the old primary/secondary system)
  - Added support for up to 5 item lookup compendiums
  - Added "Search World Items First" setting to prioritize world items over compendium items
  - Added automatic item linking in narrative JSON imports (similar to monster linking)
  - Added fuzzy matching for item names with exact match priority

### Changed
- **Improved Compendium Labels**
  - Updated compendium dropdown labels to show source and name (e.g., "Dungeons & Dragons 5th Edition: Actors")
  - Enhanced clarity when multiple compendiums share the same name
- **Enhanced Item Linking**
  - Items in rewards and other narrative fields are now automatically linked to compendium entries
  - Item linking follows the same priority system as monster linking (world first, then compendiums 1-5)
  - Improved item name matching with exact match priority over partial matches

### Fixed
- Removed legacy monster compendium primary/secondary settings
- Cleaned up unlinked item/monster display by removing "(Link Manually)" suffix
- Fixed item name matching to handle variations like "Bedroll (used for sleeping)" matching "Bedroll"

### Removed
- Removed old `monsterCompendiumPrimary` and `monsterCompendiumSecondary` settings
- Removed legacy compendium lookup code

## [1.0.15] - Optimizations

### Fixed
- Group roll summary (success/failure) now displays correctly after all players or the GM have rolled, regardless of who initiates the roll.
- Fixed issue where GM-initiated rolls did not update the chat card for all users.
- Prevented ReferenceError when requesting rolls (no roll performed yet).
- Fixed error when roll is not defined in the roll handler.
- Improved error handling and guard clauses to prevent undefined roll errors in all roll scenarios.

### Changed
- Updated all skill roll logic to use `rollSkillV2` if available, with fallback to `rollSkill` for backward compatibility with older DnD5e versions.
- Added robust compatibility checks for DnD5e 4.1+ and future 4.5+ removal of deprecated methods.
- Refactored socket and chat update logic for unified handling of both player and GM rolls.
- Improved code clarity and maintainability in skill check dialog and group roll logic.

### Compatibility
- Fully compatible with DnD5e 4.1+ and future-proofed for 4.5+ removal of deprecated APIs.
- No longer triggers deprecation warnings for skill rolls.

## [1.0.14] - 2025-04-28 - Excluded Users and Character Leadership

### Added
- Implemented character-based leadership system
- Added character name display in leader selection
- Updated movement system to follow character tokens
- Added player name display alongside character names

### Fixed
- Fixed excluded users appearing in leader selection dialog
- Fixed excluded users appearing in character vote options when using "Current Players" source
- Improved consistency of user exclusion across all voting and leader selection interfaces

### Changed
- Refactored skill check dialog and skill selection logic for improved reliability and maintainability
- Updated skill check integration to support direct result passing and input field updates
- Improved UI hiding logic for skill check and movement panels to reduce clutter when not in use
- Refactored and improved code for token following and conga line movement, ensuring smoother and more consistent pathing

## [1.0.13] - 2025-04-22 - Movement AND CLEANUP

### Added
- **Enhanced Movement System**
  - Added proper path management for conga line movement
  - Added token spacing configuration
  - Added status tracking for tokens (Normal, Blocked, Too Far)
  - Added visual indicators for token status in marching order
  - Added automatic exclusion of blocked or too-far tokens from movement

### Changed
- **Movement Improvements**
  - Improved path following behavior for tokens
  - Enhanced marching order calculation
  - Optimized path trimming logic
  - Better handling of token spacing in formation

### Fixed
- Fixed tokens stacking on top of each other during movement
- Fixed marching order recalculation issues
- Fixed path following to maintain proper spacing
- Fixed tokens skipping path points during movement
- Fixed blocked and too-far tokens attempting to join formation
- Fixed conga line movement bugs causing tokens to stack or lose formation
- Fixed follow mode issues where tokens would not properly follow the leader or would desync
- Fixed skill check dialog not updating input fields after roll
- Fixed UI elements not hiding correctly when toggled or when not relevant to the current mode

## [1.0.12] - 2025-03-25 - Rolls and Movement Controls

### Added
- **Skill Check System**
  - New skill check dialog for quick party-wide rolls
  - Support for contested rolls between groups
  - Customizable DC display and success/failure indicators
  - Quick roll context menu for common skill checks
  - Detailed roll results with formula display
  - Group success tracking for multiple participants
  - Skill descriptions and rule references

- **Movement Controls**
  - New movement configuration dialog
  - Multiple movement modes:
    - Normal movement
    - No movement
    - Combat movement
    - Follow movement
    - Conga line movement
  - Visual indicators for current movement mode
  - GM-only movement mode control
  - Persistent movement settings

- **Chat Card Improvements**
  - Enhanced skill check card layout
  - Better visual hierarchy for roll results
  - Improved success/failure indicators
  - Detailed roll information tooltips
  - Group vs group contest visualization
  - Stalemate detection and display
  - Party-wide roll success tracking

- **UI Enhancements**
  - New movement control icon in menubar
  - Quick access to skill check dialog
  - Improved chat card spacing and margins
  - Better visual feedback for roll results
  - Enhanced tooltips and information display
  - Streamlined interface for GM controls

### Changed
- Updated menubar layout to accommodate new features
- Improved error handling for settings access
- Enhanced leader selection interface
- Better synchronization of movement states
- Optimized performance for multiple simultaneous rolls

### Fixed
- Settings access error handling
- Leader selection synchronization
- Movement state persistence
- Chat card rendering issues
- Roll result calculation accuracy

## [1.0.11] - 2025-03-25 - GM Tools added

### Added
- CSS Editor for GMs to customize Foundry's appearance
  - Accessible via toolbar button
  - Live preview of CSS changes
  - Dark/Light mode toggle for editor
  - Smart indentation support
  - Copy, clear, and refresh buttons
  - Quick access to World Config and Settings
  - Smooth transition effects option
  - Changes sync to all connected clients
  - Dark themed window with light/dark editor modes
  - Proper handling of NPC type selection in Assistant panel
- Added refresh browser button to GM toolbar for quick page reloads
- Added visual character selection for skill check rolls
  - Card-based interface showing character portraits and details
  - Shows character level, class, and current HP
  - Visual selection state with hover effects
  - Only shows characters present on the canvas
  - Matches the visual style of other character cards in the system

### Fixed
- Fixed NPC type selection in Assistant panel to properly identify friendly NPCs
- Fixed CSS Editor window styling and content overflow issues
- Fixed minimum width handling in CSS Editor window
- Fixed dice roll button placement in global skill check rolls section
- Fixed drop zone styling and text in Assistant panel
- Fixed skill check roll dialog to use proper character selection UI

### Changed
- Moved dice roll functionality from Assistant criteria to global skill check rolls
- Improved drop zone UI with clearer instructions and visual feedback
- Enhanced skill check character selection with visual card-based interface
- Streamlined character selection process for skill checks

## [1.0.10] - 2025-03-25 - AI Tools

### Added
- Added character guidance into the AI tools
- Added Skillcheck lookups for monsters, items etc.  based on the selected character

### Fixed
- Fixed weapon display in character panel to properly show equipped weapons
- Simplified weapon display layout for better readability
- Fixed weapon data access in template to correctly show weapon properties
- Restored AI prompt functionality that was accidentally broken in previous update

### Changed
- Streamlined weapon display to show name and info next to image
- Simplified text colors to use default panel text colors
- Improved weapon information layout for better clarity

## [1.0.9] - Combat Tracker Enhancements

### Added
- Added visual feedback animation when dropping combatants in the initiative order
- Added improved drag and drop functionality in combat tracker
- Added visual indicators for drop zones between combatants
- Added "Roll Remaining" button to roll initiative for combatants without initiative
- Added option to automatically set first combatant when all initiatives are rolled
- Added automatic initiative rolling options:
  - Auto-roll for NPCs/monsters when added to combat
  - Auto-roll for player characters (configurable per user)
  - Auto-roll for remaining NPCs at round start

### Changed
- Enhanced cursor feedback during drag operations
- Improved spacing and visual feedback during drag and drop operations
- Updated drop target styling for better visibility
- Refactored combat tracker code for better maintainability and performance
- Enhanced initiative handling with more configuration options
- Improved mid-combat combatant addition with multiple initiative modes:
  - Auto-roll initiative
  - Set to act next
  - Add to end of round

### Fixed
- Fixed cursor styles not updating during drag operations
- Fixed initiative handling when adding new combatants mid-combat

## [1.0.8] - Encounter Toolbar

### Added
- Added Encounter Toolbar for journal entries with encounter metadata
- Added monster deployment functionality with multiple formation patterns (circle, line, random)
- Added combat creation and initiative rolling directly from journal entries
- Added encounter difficulty visualization in toolbar
- Added settings to control encounter toolbar behavior:
  - Enable/disable encounter toolbar
  - Auto-create combat after monster deployment
  - Configure monster deployment pattern

### Changed
- Improved metadata handling in journal entries
- Updated journal rendering hook to detect encounter journal entries

## [1.0.7] - Combat Timer Improvements

### Added
- Added token targeting detection to automatically start the combat timer
- Added more robust round change detection using a custom tracking variable
- Added detailed logging for better debugging of timer behavior
- Added drag and drop functionality for initiative in the combat tracker
- Added health bars to combat tracker tokens
- Added option to show portraits in combat tracker
- Added "Set as current combatant" button to combat tracker

### Changed
- Improved the interaction between Combat Timer and Planning Timer
  - Replaced direct API access with Hook-based communication
  - Simplified code structure for better maintainability
- Enhanced round change detection to prevent timer issues during round transitions
- Updated token movement detection for better compatibility with Foundry VTT v12

### Fixed
- Fixed issue with combat timer continuing to run during round changes
- Fixed multiple timer activations when round changes occur
- Fixed planning timer cleanup when transitioning between rounds
- Fixed round timer to pause when the session is not running

## [1.0.6] - Chat Message Improvements

### Added
- Added new settings for chat message control
  - Toggle for GM-only timer notifications
  - Configurable message visibility options
- Enhanced chat message handling for timers and notifications

### Changed
- Updated chat message system to respect GM-only settings
- Improved message handling for better user experience
- Fixed JSON formatting issues in chat responses

## [1.0.5] - Network Monitoring and Settings

### Added
- Added real-time latency monitoring system
  - Color-coded latency display next to player names
  - Configurable latency check frequency (5s to 5min)
  - Enable/disable latency display option
  - Automatic local GM detection for accurate readings
- Added new settings for latency monitoring
  - Toggle for enabling/disabling latency display
  - Slider for adjusting check frequency

### Changed
- Updated settings organization for better clarity
- Improved latency threshold values for more accurate status indication
- Enhanced socket message handling for better network communication

### Removed
- Removed the redundant dashboard now that we have the Squire module 

## [1.0.4] - Vote System and UI Improvements

### Added
- Added clickable vote tool area in menubar
- Added improved styling for vote section to match other UI elements

### Changed
- Updated vote tool UI to be more consistent with other elements
- Improved vote label alignment and styling
- Enhanced hover effects for vote controls

## [1.0.3] - UI Improvements and Bug Fixes

### Added
- Added quality of life aesthetic improvements
- Enhanced UI elements for better user experience

### Changed
- Updated module version to 1.0.3
- Improved overall visual consistency

## [1.0.2] - Cleanup and Refactor

### Added
- Added a new class for generating MVP descriptions based on combat stats.
- Added a new class for generating combat history.
- Added session timer date tracking to persist timer state between sessions
- Added ability to set current timer duration as the new default
- Added seconds display to session timer
- Added proper permission checks for vote initiation by party leader
- Added visual feedback for completed votes with checkmark icon

### Changed
- Moved MVPTemplates from mvp-templates.js into assets.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into stats-combat.js
- Consolidated combat-related functionality into fewer files for better maintainability
- Modified session timer to use the default time when loading on a new day
- Updated timer dialog to include option for saving current duration as default
- Updated vote system to properly handle leader permissions
- Improved vote UI with better status indicators and button states

### Removed
- Removed unused debug.js file
- Removed mvp-templates.js after moving its contents
- Removed mvp-description-generator.js after moving its contents

## [1.0.1] - It's All About Timers

### Added
- Automated release workflow using GitHub Actions
  - Automatic ZIP file creation for releases
  - Automated release creation on new version tags
  - Release notes generation

### Fixed
- Fixed timer expiration messages being sent repeatedly
- Fixed "time is running out" warning messages being sent multiple times
- Fixed planning timer synchronization between GM and players
- Fixed timer cleanup and fadeout behavior for non-GM users
- Fixed permission issues with chat messages for non-GM users
- Improved timer state management and UI updates

### Changed
- Refactored timer code to use socketlib for better client synchronization
- Updated planning timer to match combat timer's behavior
- Improved timer expiration handling for consistency across all timer types

## [1.0.0] - 2025-01-22 - Initial Release

### Added
- Combat Statistics System
  - Core combat statistics tracking
  - Round-by-round tracking with summary display
  - MVP system with card-based stat display
  - Notable moments tracking with party focus
  - Party breakdown with individual performance stats
  - Combat session stats with accuracy tracking
  - Combat statistics chat output
- Combat Management
  - Combat timer with pause/resume functionality
  - Planning timer with strategic phase support
  - Turn tracking system with accurate timing
- UI Enhancements
  - Combat dashboard with real-time statistics
  - Visual progress indicators and timers
  - Multiple visual themes
  - Player portraits with rank overlays
  - Icons for critical hits and fumbles
  - Consistent header styling
- Full documentation and README
- FoundryVTT v12 compatibility

### Changed
- Updated Notable Moments section title to "Notable Party Moments"
- Ensured chat messages come from GM instead of selected token

### Fixed
- Fixed MVP player name formatting
- Adjusted fumble icon color for better visibility


