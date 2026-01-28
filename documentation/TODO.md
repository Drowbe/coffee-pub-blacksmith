# TODO - Active Work and Future Ideas

## CRITICAL BUGS

### Chat Card API
- **Issue**: Chat card system exists internally but is not exposed via API for external modules
- **Status**: PENDING - Critical need for external module integration
- **Location**: `scripts/manager-rolls.js`, new API file (e.g., `scripts/api-chatcards.js`)
- **Need**: 
  - Expose chat card creation/update functionality via API
  - Allow external modules to create and manage chat cards similar to pins API pattern
  - API methods: `chatCards.create()`, `chatCards.update()`, `chatCards.delete()`, etc.
  - Support for custom card templates and styling
  - Integration with existing roll system and skill check system
- **Priority**: CRITICAL - Needed for external module development

### Memory Leak Investigation
- **Issue**: Browser tab memory grows to 9.5 GB in ~3 hours while heap stays ~950 MB, leading to crashes.
- **Status**: IN PROGRESS — see `documentation/performance.md` for full investigation notes, findings, and next steps.
- **Progress**: 5 of 7 critical/high-priority items completed.
- **Next Step**: Optimize menubar rerenders (item 6) - introduce state diffing/throttling to reduce frequent rebuilds during combat/timer events. Then address image cache footprint (item 7) if needed.
- **Location**: See `documentation/performance.md`

## MEDIUM BUGS

### Verify Loot Token Restoration
- **Issue**: Ensure tokens converted to loot piles reliably restore their original images after revival
- **Status**: PENDING - Needs validation pass
- **Location**: `scripts/token-image-utilities.js`
- **Need**: Regression testing across scenarios (various token types, scene reloads, Item Piles enabled/disabled)
- **Related Settings**: `tokenConvertDeadToLoot`, `tokenLootPileImage`


## ENHANCEMENTS

### High Priority

### Medium Priority

#### Window API
- **Issue**: Create a Window API for managing and controlling Blacksmith windows
- **Status**: PENDING - Needs implementation
- **Location**: New API file (e.g., `scripts/api-windows.js`)
- **Need**: API for creating, managing, and controlling Blacksmith windows (similar to pins API pattern)

#### Pin Text Display System
- **Issue**: Pin text property exists but is not displayed. Need to implement text display system similar to Foundry's note/token text.
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/pins-schema.js`, `scripts/pins-renderer.js`, `styles/pins.css`
- **Need**: 
  - **Text Layout Options:**
    - Text under icon (default/standard)
    - Text around icon (wrapping around circular/square pin)
  - **Text Display Options:**
    - Text always on
    - Text on hover
    - Never show text
    - Only GM sees text
  - **Text Format Options:**
    - Color (configurable)
    - Size (configurable)
    - Length before ellipsis (truncation with "...")
    - Drop shadow (honor pin's `dropShadow` setting)
  - Add text display properties to `PinData` schema
  - Render text element in pin DOM structure
  - CSS styling for text positioning and formatting
  - Permission checks for GM-only text visibility

#### Configure Pin
- **Issue**: Add pin configuration functionality accessible both programmatically (via API) and via right-click context menu
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-pins.js`, `scripts/pins-renderer.js` (context menu)
- **Need**: 
  - API method: `pins.configure(pinId, options?)` - Opens configuration dialog for a pin
  - Context menu item: "Configure Pin" - Opens configuration dialog from right-click menu
  - Configuration dialog should allow editing all pin properties (text, image, shape, style, size, ownership, text display options, etc.)
  - Should respect permissions (only users who can edit the pin can configure it)

#### Hide Dead and Skip Dead Options for Menubar and Combat Tracker
- **Issue**: Need options to hide and skip dead combatants in menubar and combat tracker
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/api-menubar.js`, `scripts/combat-tracker.js`
- **Need**: Settings for `menubarHideDead`, `menubarSkipDead`, `combatTrackerHideDead` with filtering logic

#### Hide Initiative Roll Chat Cards
- **Issue**: Initiative roll chat cards clutter the chat log
- **Status**: PENDING - Needs implementation
- **Location**: Initiative roll handling (combat-tracker.js or combat-tools.js)
- **Need**: Setting to hide initiative roll cards (for all users or players only), while maintaining functionality

#### Query Tool Review and Improvements
- **Issue**: Query tool needs comprehensive review and fixes for functionality and UX
- **Status**: PENDING - Needs review and implementation
- **Location**: `scripts/window-query.js`
- **Need**: Verify all tabs work, review/fix drop functionality design, fix JSON generation

#### Token/Portrait Image Cache – Expand Filename Parsing for Tags
- **Issue**: Only filename parts that match specific patterns (class, weapon, armor, size) become tags. Unmatched parts (e.g. profession, race, gender) are discarded. Example: `merchant-shopkeeper-butcher-human-male-03.webp` currently yields only `MERCHANT`; user expects tags: merchant, shopkeeper, butcher, human, male.
- **Status**: PENDING - Plan agreed; implementation not started
- **Location**: `scripts/manager-image-cache.js` – `METADATA_PATTERNS`, `IGNORED_WORDS`, `_extractMetadata()` (lines 386–409), `_generateTagsFromMetadata()` (lines 474–507)
- **Need**:
  - Collect unmatched filename parts (after pattern checks and IGNORED_WORDS) into a new metadata array (e.g. `metadata.filenameTags` or similar).
  - In `_generateTagsFromMetadata()`, add those parts as tags (uppercase) in addition to existing pattern-derived tags.
  - Optionally wire in more `METADATA_PATTERNS` (e.g. profession, action, direction, quality, creatureType) if they should feed tags; currently only class, weapon, armor, size are used in the loop.
- **Notes**: Same parsing applies to both token and portrait caches. Class, weapon, armor, size remain used by the matching algorithm; new tags are for display/filtering and search.

#### Add Enable Setting for Nameplate Styling
- **Issue**: Nameplate styling should operate independently from nameplate content/formatting
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/settings.js`, `scripts/manager-canvas.js`
- **Need**: New `enableNameplateStyling` setting, update `_updateSingleTokenNameplate()` to check setting

#### Migrate defaultRulebooks Setting to Checkboxes and Custom Box
- **Issue**: defaultRulebooks should use checkboxes for common rulebooks and custom text box for additional ones
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/settings.js`
- **Need**: Checkbox settings for PHB/DMG/MM/XGtE/TCoE, custom text box, backward compatibility

#### Refactor Compendium Settings into Reusable Function
- **Issue**: Compendium settings have repeated code patterns that could be consolidated
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/settings.js`
- **Need**: Create `registerCompendiumSettings(type, displayName, numCompendiums, group)` function to replace repeated loops

#### Combat Stats - Review and Refactor
- **Issue**: Combat stats system needs review and potential refactoring
- **Status**: PENDING - Needs investigation and planning
- **Location**: `scripts/stats-combat.js`, potentially `scripts/stats-player.js`
- **Need**: Review implementation, identify unused code/duplicates, check performance, review UI/UX

#### Tune Default Zoom Levels for Broadcast Modes
- **Issue**: Default zoom levels for broadcast modes (follow, combat, spectator) may need tuning for optimal viewing
- **Status**: PENDING - Needs investigation and tuning
- **Location**: `scripts/manager-broadcast.js`
- **Need**: Review and adjust default zoom levels for each broadcast mode to ensure optimal framing and visibility

#### Broadcast: Combat Spectator Mode
- **Issue**: Add a "Combat Spectator" broadcast mode that follows all tokens in the combat tracker (not just the party)
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/manager-broadcast.js`, `scripts/settings.js`
- **Need**: 
  - New broadcast mode similar to Spectator, but frame/follow all combatant tokens (party + NPCs/enemies) instead of only party tokens
  - Use same view-fill/zoom behavior as Spectator (e.g. center on combatant token positions, zoom to fit)
  - Add mode option to broadcast mode selector and settings; optional dedicated view-fill setting (or reuse spectator/combat setting)
- **Related**: Spectator mode (party only); Combat mode (current turn + targets). Combat Spectator = "show whole fight" framing.

#### Clarity / Quickview (GM-only vision aid)
- **Issue**: GM-only local brightness filter and token vision override feature needs verification and finalization
- **Status**: IN PROGRESS
- **Location**: Clarity/Quickview implementation
- **Remaining**: Verify player client sees no change, decide overlay behavior, confirm fog opacity, lifecycle sanity checks, remove debug logging, add changelog entry

### Low Priority

#### Migrate Combat Hooks to lib-wrapper
- **Issue**: Using Foundry hooks for Combat methods that should be wrapped with lib-wrapper instead
- **Status**: PENDING - Needs implementation
- **Location**: `scripts/stats-combat.js`, `scripts/combat-tracker.js`, `scripts/timer-combat.js`, `scripts/manager-libwrapper.js`
- **Need**: Replace `combatStart`, `updateCombat`, `endCombat`, `deleteCombat` hooks with lib-wrapper wrappers for Combat prototype methods


## TECHNICAL DEBT

### jQuery Detection Pattern is Technical Debt
- **Status**: TECHNICAL DEBT - Transitional pattern during v13 migration  
- **Priority**: MEDIUM - Should be addressed after migration is complete  
- **Location**: Multiple files using jQuery detection pattern

**Why This Pattern is Problematic**

In FoundryVTT v13, jQuery is completely removed. Ideally, `html` parameters should always be native DOM elements.

The jQuery detection pattern indicates we're still in a mixed state where jQuery might be passed in. This is defensive code to handle an inconsistency we should fix at the source, not normalize at the destination.

**What We Should Do Instead**

**Long-term (fully migrated v13):**
- Ensure call sites pass native DOM elements consistently
- Remove all jQuery detection code
- TypeScript or explicit checks at call sites can enforce this

**Short-term (during migration):**
- This pattern is acceptable to prevent crashes while migrating
- Plan to remove it once all call sites are fixed
- Track which methods use this pattern and why

**The Real Question**

**Where is `html` coming from that might be a jQuery object?**
- If it's from FoundryVTT's Application classes: they should return native DOM in v13, so the check isn't needed
- If it's from our code: fix the call sites to pass native DOM
- If it's unknown: keep the check temporarily, but track and fix the sources

**Bottom Line**

Keep jQuery detection during migration, but treat it as technical debt. Once all call sites are confirmed to pass native DOM elements (especially when elements come from `querySelector()` which always returns native DOM), remove the detection code.

**Action Item:** After migration, audit all jQuery detection patterns and remove those where the source is guaranteed to be native DOM (e.g., `querySelector()` results).

**Migration Task:**
- [x] Audit all jQuery detection patterns after v13 migration is complete ✅ **COMPLETE** - See `documentation/jquery-detection-audit.md`
- [ ] Identify which detections are unnecessary (source is guaranteed native DOM) - **IN PROGRESS** - Testing required
- [ ] Remove unnecessary jQuery detection code - **PENDING** - Awaiting test results
- [x] Document which detections are necessary and why ✅ **COMPLETE** - See audit report
- [ ] Create test cases to verify native DOM is always passed - **PENDING** - See audit report testing plan

**Audit Status:** Initial audit complete. Found 74 instances across 5 categories. Key finding: Inconsistency in `activateListeners(html)` and `this.element` handling suggests some detections may be unnecessary. Testing plan created to verify necessity. See `documentation/jquery-detection-audit.md` for full report.

### Socketmanager Becoming Monolithic
- **Issue**: Socketmanager is evolving into a "god class" that both manages hooks AND contains business logic
- **Status**: PENDING - Needs refactoring
- **Proposed Solution**: Socketmanager should ONLY manage socket registration/cleanup (like hookmanager), business logic should be moved elsewhere


## DEFERRED

### Performance - Large Cache Memory & Parallelization
- **Issue**: Additional performance optimizations available but not critical
- **Status**: DEFERRED - Current performance is acceptable
- **Items**: Large cache memory usage (17,562+ files), sequential token matching that could be parallelized
- **Trigger for Revisiting**: If users report memory issues with very large collections (50,000+ files) or matching performance becomes bottleneck

### Search Performance - Phase 2/3 Optimizations
- **Issue**: Additional performance optimizations available if Phase 1 improvements prove insufficient
- **Status**: DEFERRED - Phase 1 optimizations resolved lag issues
- **Reason**: User testing confirms Phase 1 improvements are sufficient
- **Available if needed**: Streaming/incremental results, score caching, parallelization, index-based search, pre-computed similarity scores
- **Trigger for Revisiting**: If users report lag returns with larger datasets (20,000+ files) or different usage patterns

### OpenAI API Not Exposed to External Modules
- **Issue**: OpenAI functions exist in `api-core.js` but are NOT exposed via `module.api`
- **Status**: DEFERRED - Not currently blocking any active development
- **Location**: `scripts/api-core.js` (getOpenAIReplyAsHtml, getOpenAIReplyAsJson, getOpenAIReplyAsText)
- **Plan**: Add OpenAI functions to `UtilsManager.getUtils()` and expose via `module.api.utils`
- **Deferred Reason**: No external modules currently need this functionality


## BACKLOG

### Targeted By
- Add some way to see who is targeting things

### Token Outfits
- Allow for token outfits - extend what we do for image replacement

### Rest and Recovery
- Allow for long and short rests with configurable food/water consumption and spell slot recovery

### Auto-Roll Injury Based on Rules
- Automatically trigger injury rolls based on configurable rules/conditions (HP thresholds, critical hits, massive damage, etc.)

### Multiple Image Directories for Token Image Replacement
- Allow users to configure multiple image directories with priority order

### No Initiative Mode
- Alternative combat mode where GM manually controls turn order instead of initiative rolls

### Export Compendium as HTML
- Export compendium contents as formatted HTML document for sharing, printing, or archiving

### CODEX-AI Integration
- Integrate CODEX system with AI API for cost-efficient context management, replace conversation history with relevant CODEX entries
