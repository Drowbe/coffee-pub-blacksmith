# Broadcast Feature Architecture

> **For Blacksmith Developers Only**
> 
> This document covers the **internal architecture** of the Broadcast feature in Coffee Pub Blacksmith.
> 
> The Broadcast feature enables streaming/recording of FoundryVTT sessions by designating a specific user as the "cameraman" who sees a clean, UI-free view that automatically follows tokens.

**Audience:** Contributors to the Blacksmith codebase.

## **Overview**

The Broadcast feature provides a simple, powerful system for streaming FoundryVTT sessions. Unlike modules that attempt to detect OBS automatically, Blacksmith uses a **user-based approach**: a designated user (the "cameraman") logs into the session and receives a specially configured view.

**Key Design Principle:** Instead of trying to detect OBS or browser sources (which is fragile and unreliable), we identify a specific user as the "broadcast user" and configure their client accordingly.

## **Current Status: IMPLEMENTED (Active)**

User-based broadcast approach; modes and secondary bar in place. Remaining work (if any) in **`TODO.md`**.

## **Current Implementation (v13.0.13)**

### **Modes and Views**
- **Spectator**: Follows party tokens and uses viewport fill percent for zoom.
- **Combat**: Mirrors follow behavior with a fixed 3x3 minimum box, turn-start pan, and movement follow. Includes targeted tokens in framing.
- **GM View**: Mirrors GM viewport.
- **Map View**: Fits the current map to screen.
- **Player View**: Split into **Mirror** (mirror a player viewport) and **Follow** (follow a selected token).

### **Secondary Bar Groups**
- **Modes**: Broadcast modes (switch group).
- **Mirror**: Dynamic buttons for online players (switch group).
- **Follow**: Dynamic buttons for player tokens on the current scene (switch group).
- **Tools**: Close images, close journals, close all windows, refresh client, open settings (GM-only).

### **Auto-Close Windows**
- Cameraman client signals when a window opens.
- GM starts an auto-close timer and sends a close command to the cameraman.
- Close commands can target images, journals, or all windows.

## **Core Architecture Principles**

### **1. User-Based Design (Not OBS Detection)**

**Why User-Based Approach:**
- **Reliable**: No fragile browser detection needed
- **Configurable**: GM selects the cameraman user
- **Flexible**: Works with OBS, other streaming tools, or recordings
- **Consistent**: Same pattern as existing `excludedUsersMenubar` setting

**OBS Detection Assessment:**
- ❌ **Not Needed**: User-based approach eliminates the need for OBS detection
- ❌ **Fragile**: Browser detection is unreliable and can break with updates
- ✅ **Optional Enhancement**: Could be added later as a convenience feature to auto-enable settings, but not core functionality

### **2. Permission Model**

The broadcast user should have **OBSERVER** role permissions on party tokens:
- Can see what players see for their tokens
- Respects vision/lighting rules
- Doesn't grant full GM visibility (unless user is already GM)

### **3. UI Hiding Strategy**

When the broadcast user is active:
- **Foundry Core UI**: Hide via CSS and application hooks
- **Blacksmith UI**: Use existing "hide from user" patterns
- **Squire UI**: Coordinate with Squire module (if needed)

## **Design Goals**

1. **Simple**: GM selects one user as "broadcast user"
2. **Powerful**: Full camera control, multiple following modes
3. **Clean**: Complete UI removal (Foundry + Blacksmith + Squire)
4. **Reliable**: No fragile detection mechanisms
5. **Performant**: Efficient camera updates and UI toggling

## **Core Components**

### **BroadcastManager Class**
**Location**: `scripts/manager-broadcast.js`

**Purpose**: Centralized management of all broadcast functionality

**Key Responsibilities:**
- Identify broadcast user (cameraman)
- Coordinate UI hiding across all systems
- Manage camera following modes
- Handle permission configuration

### **BroadcastCamera Class**
**Location**: `scripts/broadcast-camera.js` (or within `manager-broadcast.js`)

**Purpose**: Camera control and token following

**Key Responsibilities:**
- Token following (spectator/owner based)
- Combat token tracking
- Custom token selection
- Birds-eye mode (fit map to screen)
- Tracked mode (copy another user's viewport)

### **BroadcastUI Class**
**Location**: `scripts/broadcast-ui.js` (or within `manager-broadcast.js`)

**Purpose**: UI hiding and cleanup

**Key Responsibilities:**
- Hide Foundry core UI elements
- Hide Blacksmith UI elements
- Coordinate with Squire module (if available)
- Remove/restore background elements

## **User Identification**

### **Broadcast User Setting**

**Setting Name**: `broadcastUserId`
**Type**: String (user ID or user name)
**Scope**: World (GM only)

**Pattern**: Similar to `excludedUsersMenubar`:
```javascript
// Check if current user is broadcast user
static _isBroadcastUser(user) {
    if (!user) user = game.user;
    const broadcastUserId = game.settings.get(MODULE.ID, 'broadcastUserId') || '';
    if (!broadcastUserId) return false;
    
    const userId = broadcastUserId.trim().toLowerCase();
    const matchesId = user.id.toLowerCase() === userId;
    const matchesName = user.name ? user.name.toLowerCase() === userId : false;
    
    return matchesId || matchesName;
}
```

**Code Reuse Consideration**: Both `_isUserExcluded` (menubar) and `_isBroadcastUser` use the same pattern. Consider extracting to a shared utility function in `api-core.js` or `common.js` for code reuse:
```javascript
// In api-core.js or common.js
export function matchUserBySetting(user, settingValue) {
    if (!user || !settingValue) return false;
    const tokens = settingValue.split(',').map(token => token.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) return false;
    
    const matchesId = tokens.includes(user.id.toLowerCase());
    const matchesName = user.name ? tokens.includes(user.name.toLowerCase()) : false;
    return matchesId || matchesName;
}

// Then both can use:
// MenuBar._isUserExcluded(user) -> matchUserBySetting(user, game.settings.get(MODULE.ID, 'excludedUsersMenubar'))
// BroadcastManager._isBroadcastUser(user) -> matchUserBySetting(user, game.settings.get(MODULE.ID, 'broadcastUserId'))
```

**Usage Pattern** (matching existing `_isUserExcluded` pattern):
- Check user ID first (most reliable)
- Fall back to user name (more user-friendly)
- Case-insensitive matching
- Works in all UI rendering hooks

## **UI Hiding Strategy**

### **Simplified Hiding System**

#### **1. Foundry Core UI**

**Structure Discovery**: The entire Foundry interface is in a single `<div id="interface">` containing `ui-left`, `ui-middle`, and `ui-right` sections.

**Elements to Hide:**
- `#interface` - Hides entire Foundry UI (navigation, players, hotbar, controls, pause, hud, etc.)
- **Optional Granular Control**: Individual sections can be hidden:
  - `#interface > section.ui-left` - Left sidebar (navigation, players, etc.)
  - `#interface > section.ui-middle` - Middle section
  - `#interface > section.ui-right` - Right sidebar

**Method**: CSS classes + body class toggle
```css
.broadcast-mode #interface {
    display: none !important;
    visibility: hidden !important;
}

/* Optional: Granular control with settings */
.broadcast-mode #interface > section.ui-left {
    display: none !important;
}

.broadcast-mode #interface > section.ui-middle {
    display: none !important;
}

.broadcast-mode #interface > section.ui-right {
    display: none !important;
}
```

**Implementation**: Add `broadcast-mode` class to `<body>` when broadcast user is active. Toggle via JavaScript based on `_isBroadcastUser()` check.

#### **2. Blacksmith UI**

**Structure Discovery**: Menubar is in its own separate `.blacksmith-menubar-container` div

**Elements to Hide:**
- `.blacksmith-menubar-container` - Entire menubar (separate div)
- Encounter Toolbar (if separate div)
- Any other Blacksmith UI components

**Method**: CSS targeting separate divs
```css
.broadcast-mode .blacksmith-menubar-container {
    display: none !important;
    visibility: hidden !important;
}
```

**Implementation**: 
- Check `BroadcastManager._isBroadcastUser()` when rendering
- Skip DOM injection entirely (like existing exclusion pattern)
- Add CSS class for additional hiding via stylesheet

#### **3. Squire UI (External Module)**

**Structure Discovery**: Squire has its own separate div `.squire-tray`

**Method**: CSS targeting
```css
.broadcast-mode .squire-tray {
    display: none !important;
    visibility: hidden !important;
}
```

**Coordination Strategy:**
- Check if Squire is active (optional)
- Use CSS targeting (simplest approach)
- Works automatically when broadcast mode is active

### **Background Removal**

**Scene Background:**
- Remove scene background image when in broadcast mode
- Optionally keep fog of war (configurable)

**Method**: CSS overlay or scene modification
```css
.broadcast-mode .background {
    opacity: 0;
    background: transparent;
}
```

**Secondary Bar Styling:**
- Add CSS variable for broadcast bar height (matches combat bar)
- Default height: `60px` (same as combat bar)
```css
:root {
    --blacksmith-menubar-secondary-broadcast-height: 60px;
}
```

## **Camera Following Modes**

### **Mode 1: Spectator/Owner Following**

**Description**: Automatically follow tokens where broadcast user has OBSERVER permission

**Logic:**
- Monitor all tokens on current scene
- Check `token.testUserVisibility(broadcastUser)` or OBSERVER permission
- When token moves, pan camera to token position
- Follow party tokens primarily

**Implementation:**
- Hook `updateToken` for position changes
- Use `canvas.animatePan({ x, y })` (already exists in `api-menubar.js`)
- Throttle updates (don't pan on every pixel movement)

### **Mode 2: Combat Token Following**

**Description**: Follow the current combatant's token during combat

**Logic:**
- Hook `updateCombat` for turn changes
- Get current combatant
- Pan to current combatant's token
- Works seamlessly with `MenuBar.panToCombatant()` (already exists)

**Implementation:**
- Reuse `MenuBar.panToCombatant(combatantId)` logic
- Hook `updateCombat` with priority 3 (normal)

### **Mode 3: Custom Token Selection**

**Description**: GM selects specific tokens to follow (multi-select)

**Logic:**
- GM selects tokens via settings UI
- Store selected token IDs in setting
- Follow all selected tokens (pan to average position or cycle)
- Update on token movement

**Implementation:**
- Setting: `broadcastFollowTokens` (array of token IDs)
- Token picker UI in settings
- Update camera when any selected token moves

### **Mode 4: Birds-Eye Mode**

**Description**: Fit entire map to screen (zoom out to show all)

**Logic:**
- Calculate scene bounds (all tokens + map edges)
- Calculate optimal zoom level to fit bounds
- Pan to center of bounds
- Use `canvas.animatePan()` and `canvas.animateZoom()`

**Implementation:**
- Function: `_calculateBirdsEyeBounds()`
- Use `canvas.animatePan()` and `canvas.animateZoom()`
- Recalculate on scene change

### **Mode 5: Tracked Mode (Copy Viewport)**

**Description**: Copy another user's viewport position and zoom

**Logic:**
- Target user pans/zooms
- Send viewport state via socket to broadcast user
- Broadcast user applies same viewport
- Real-time synchronization

**Implementation:**
- Hook `canvas.viewport` changes (if available)
- Socket message: `broadcast:viewport-sync`
- Apply: `canvas.pan()` and `canvas.zoom()`
- Latency considerations (may need smoothing)

## **Permission Model**

### **OBSERVER Role Configuration**

**Requirement**: Broadcast user should have OBSERVER permission on party tokens

**Implementation:**
- **Option 1 (Manual)**: GM configures permissions manually in Foundry
- **Option 2 (Automatic)**: Broadcast feature can attempt to set OBSERVER permissions (may require GM)
- **Option 3 (Hybrid)**: Check permissions, warn if not set, optionally set if GM

**Recommended**: Option 3 - Check and warn, with optional auto-set (GM only)

**Permission Check:**
```javascript
static _checkObserverPermissions(token, userId) {
    // Check if user has OBSERVER permission
    const permissions = token.actor.permission;
    return permissions[userId] === CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER;
}
```

**Token Visibility Check:**
```javascript
// Already exists in Foundry API
token.testUserVisibility(broadcastUser)
```

## **Settings Configuration**

### **Core Settings**

#### **1. `enableBroadcast`**
- **Type**: Boolean
- **Scope**: World
- **Default**: `false`
- **Description**: Enable/disable broadcast feature entirely

#### **2. `broadcastUserId`**
- **Type**: String
- **Scope**: World (GM only)
- **Default**: `""`
- **Description**: User ID or name of broadcast user (cameraman)
- **Hint**: "User who will see the broadcast view (logged into OBS session)"

#### **3. `broadcastMode`**
- **Type**: Select
- **Scope**: World
- **Options**: 
  - `"spectator"` - Follow tokens with OBSERVER permission
  - `"combat"` - Follow current combatant
  - `"custom"` - Follow selected tokens
  - `"birdseye"` - Fit map to screen
  - `"tracked"` - Copy another user's viewport
  - `"manual"` - No automatic following
- **Default**: `"spectator"`

#### **4. `broadcastFollowTokens`**
- **Type**: Array of token IDs
- **Scope**: World
- **Default**: `[]`
- **Description**: Tokens to follow in "custom" mode
- **UI**: Token picker in settings

#### **5. `broadcastTrackedUser`**
- **Type**: String (user ID)
- **Scope**: World
- **Default**: `""`
- **Description**: User whose viewport to copy in "tracked" mode

#### **6. `broadcastHideBackground`**
- **Type**: Boolean
- **Scope**: World
- **Default**: `true`
- **Description**: Remove scene background in broadcast mode

#### **7. `broadcastHideNotifications`**
- **Type**: Boolean
- **Scope**: World
- **Default**: `false`
- **Description**: Hide notification tray in broadcast mode

#### **11. `broadcastAutoSetObserver`**
- **Type**: Boolean
- **Scope**: World (GM only)
- **Default**: `false`
- **Description**: Automatically set OBSERVER permissions on party tokens for broadcast user

## **Broadcast Secondary Bar**

### **Secondary Bar UI**

The broadcast feature uses a **secondary bar** (similar to combat bar) that appears below the main menubar when toggled.

**Height**: Same as combat bar (60px by default, configurable via CSS variable)
- CSS variable: `--blacksmith-menubar-secondary-broadcast-height`
- Default: `60px` (matches `--blacksmith-menubar-secondary-combat-height`)

**Toggle Button**: Menubar tool in middle zone, combat group
- Tool ID: `broadcast-toggle`
- Icon: `fa-solid fa-video` (or similar broadcast/video icon)
- Toggleable: `true` (for active state syncing)
- Group: `"combat"` (same group as combat tracker)
- Group Order: `1` (combat group)
- Order: `3` (after combat tracker which is order 2)

**Registration Pattern** (matching combat bar):
```javascript
// 1. Register secondary bar type
await MenuBar.registerSecondaryBarType('broadcast', {
    height: MenuBar.getSecondaryBarHeight('broadcast'), // Uses CSS variable or defaults to combat height
    persistence: 'manual',
    templatePath: null  // Use default tool system (or custom template if needed)
});

// 2. Register toggle button in menubar
MenuBar.registerMenubarTool('broadcast-toggle', {
    icon: 'fa-solid fa-video',
    name: 'broadcast-toggle',
    title: () => MenuBar.secondaryBar.isOpen && MenuBar.secondaryBar.type === 'broadcast' 
        ? 'Broadcast Bar' 
        : 'Broadcast Bar',
    tooltip: () => MenuBar.secondaryBar.isOpen && MenuBar.secondaryBar.type === 'broadcast'
        ? 'Hide broadcast controls'
        : 'Show broadcast controls',
    onClick: () => MenuBar.toggleSecondaryBar('broadcast'),
    zone: 'middle',
    group: 'combat',
    groupOrder: MenuBar.GROUP_ORDER.COMBAT,
    order: 3,
    moduleId: 'blacksmith-core',
    gmOnly: true,  // Only GMs can toggle broadcast
    leaderOnly: false,
    visible: true,
    toggleable: true,
    active: false,
    iconColor: null,
    buttonNormalTint: null,
    buttonSelectedTint: null
});

// 3. Register tool-to-bar mapping for automatic button state syncing
MenuBar.registerSecondaryBarTool('broadcast', 'broadcast-toggle');
```

**Secondary Bar Content**: 
- Initially empty (placeholder for future broadcast controls)
- Uses default tool system (register items later as needed)
- Can add broadcast-specific controls (mode selector, token picker, etc.) via `registerSecondaryBarItem()`

## **File Structure**

### **New Files**

```
scripts/
  ├── manager-broadcast.js    # Main broadcast manager class
  ├── broadcast-camera.js     # Camera control and following logic (optional: could be in manager)
  └── broadcast-ui.js         # UI hiding logic (optional: could be in manager)
```

**Decision**: Could consolidate into single `manager-broadcast.js` file, or split for organization. Start with single file, split later if needed.

### **Modified Files**

```
scripts/
  ├── settings.js             # Add broadcast settings
  ├── blacksmith.js           # Initialize BroadcastManager
  └── api-menubar.js          # Register broadcast secondary bar type and toggle tool

styles/
  ├── menubar.css             # Add --blacksmith-menubar-secondary-broadcast-height variable (default: 60px)
  └── broadcast.css           # New CSS file for broadcast mode styling (if needed)

lang/
  └── en.json                 # Add broadcast setting translations
```

## **Code Reuse Opportunities**

### **Shared User Matching Pattern**

**Current Duplication**: Both `MenuBar._isUserExcluded()` and `BroadcastManager._isBroadcastUser()` use the same pattern for matching users by setting value.

**Recommendation**: Extract to shared utility in `api-core.js`:
```javascript
// In api-core.js
/**
 * Match a user against a comma-separated setting value (user IDs or names)
 * @param {User} user - The user to check
 * @param {string} settingValue - Comma-separated string of user IDs or names
 * @returns {boolean} True if user matches
 */
export function matchUserBySetting(user, settingValue) {
    if (!user || !settingValue) return false;
    const tokens = settingValue.split(',').map(token => token.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) return false;
    
    const matchesId = tokens.includes(user.id.toLowerCase());
    const matchesName = user.name ? tokens.includes(user.name.toLowerCase()) : false;
    return matchesId || matchesName;
}
```

**Refactor Benefits**:
- Single source of truth for user matching logic
- Easier to maintain and test
- Consistent behavior across all features
- Both functions become thin wrappers

**Usage After Refactor**:
```javascript
// In api-menubar.js
static _isUserExcluded(user) {
    if (!user) return false;
    const settingValue = game.settings.get(MODULE.ID, 'excludedUsersMenubar') || '';
    return matchUserBySetting(user, settingValue);
}

// In manager-broadcast.js
static _isBroadcastUser(user) {
    if (!user) user = game.user;
    const settingValue = game.settings.get(MODULE.ID, 'broadcastUserId') || '';
    return matchUserBySetting(user, settingValue);
}
```

**When to Refactor**: 
- ✅ **Now**: If implementing broadcast feature (good opportunity to clean up existing code)
- ⏳ **Later**: If we add more features that need user matching

## **Integration Points**

### **1. Existing Menubar Exclusion Pattern**

**Current Pattern:**
```javascript
static _isUserExcluded(user) {
    // Check excludedUsersMenubar setting
}
```

**Integration:**
- Add `BroadcastManager._isBroadcastUser()` check
- In menubar rendering: `if (BroadcastManager._isBroadcastUser() || MenuBar._isUserExcluded()) { return; }`
- Reuse same pattern for all UI elements

### **2. Existing Camera Panning**

**Current Implementation:**
- `MenuBar.panToCombatant(combatantId)` in `api-menubar.js`
- Uses `canvas.animatePan({ x, y })`

**Integration:**
- Reuse `canvas.animatePan()` for all following modes
- Share panning logic between menubar and broadcast

### **3. Socket System**

**Current System:**
- `SocketManager` in `manager-sockets.js`
- Supports SocketLib and native fallback

**Integration:**
- Use `SocketManager` for tracked mode viewport sync
- Socket event: `broadcast:viewport-sync`

### **4. Hook Manager**

**Current System:**
- `HookManager` in `manager-hooks.js`
- Priority-based hook registration

**Integration:**
- Register hooks for:
  - `updateToken` (position changes)
  - `updateCombat` (turn changes)
  - `renderApplication` (UI hiding)
  - `renderSidebar` (UI hiding)

## **Implementation Phases**

### **Phase 1: Core Infrastructure** (Foundation)
- Create `BroadcastManager` class
- Add `broadcastUserId` setting
- Implement `_isBroadcastUser()` check (or use shared `matchUserBySetting()` utility)
- Add `enableBroadcast` setting
- Extract shared user matching pattern to `api-core.js` (code reuse)

### **Phase 2: Secondary Bar** (UI Controls)
- Register broadcast secondary bar type (same height as combat bar)
- Register broadcast toggle button in menubar
- Register tool-to-bar mapping for state syncing
- Add CSS variable for broadcast bar height

### **Phase 3: UI Hiding** (Visual Cleanup)
- Hide Foundry core UI (navigation, hotbar, controls)
- Hide Blacksmith menubar for broadcast user
- Hide other Blacksmith UI elements
- Add CSS classes and styling

### **Phase 4: Basic Following** (Camera Control)
- Spectator/Owner following mode
- Combat token following mode
- Background removal

### **Phase 5: Advanced Following** (Enhanced Features)
- Custom token selection mode
- Birds-eye mode
- Settings UI for token picker

### **Phase 6: Tracked Mode** (Optional Enhancement)
- Viewport synchronization via sockets
- Tracked user selection
- Smooth transitions

### **Phase 7: Polish & Integration** (Final Touches)
- Coordinate with Squire module
- Permission auto-configuration
- Performance optimization
- Documentation

## **Technical Considerations**

### **Performance**

**Camera Updates:**
- Throttle pan operations (don't update every frame)
- Use requestAnimationFrame for smooth animations
- Debounce rapid token movements

**UI Hiding:**
- Check `_isBroadcastUser()` early in render hooks
- Skip DOM manipulation if not broadcast user
- Cache broadcast user check result per render cycle

### **Compatibility**

**FoundryVTT v13:**
- Use v13 API patterns (native DOM, Application V2)
- No jQuery dependencies

**Module Conflicts:**
- May conflict with other camera/UI hiding modules
- Document conflicts in README
- Use priority system in hooks to handle conflicts

**Squire Integration:**
- Check if Squire is active before attempting coordination
- Graceful degradation if Squire API unavailable
- Document coordination approach

### **Edge Cases**

**Scene Changes:**
- Reset camera mode on scene change
- Handle scene loading delays
- Recalculate birds-eye bounds

**Combat End:**
- Transition from combat mode to spectator mode
- Handle no-combat scenarios gracefully

**Broadcast User Disconnects:**
- Disable broadcast mode automatically?
- Keep mode but pause following?
- (Preference: Keep mode, pause following)

**Token Not Found:**
- Handle deleted tokens in custom selection
- Skip missing tokens in following logic
- Clean up token IDs from settings

## **OBS Detection: Final Decision - Not Implemented**

### **Decision: OBS Detection Will Not Be Implemented**

**Final Answer**: OBS detection is **not needed** and **will not be implemented** for the broadcast feature.

**Why OBS Detection Was Considered:**
- Potential convenience (auto-enable settings when detected)
- Could reduce manual configuration steps

**Why OBS Detection Was Rejected:**
- ❌ **Fragile**: Browser detection is unreliable and can break with updates
- ❌ **Not Core**: Everything works perfectly without it
- ❌ **Better UX**: Manual broadcast user selection is clearer and more reliable
- ❌ **Unnecessary Complexity**: Adds fragile detection code without real benefit

**The User-Based Approach Is Superior:**
- ✅ **Reliable**: Designated user approach doesn't depend on browser detection
- ✅ **Flexible**: Works with OBS, other streaming tools, recordings, or any use case
- ✅ **Clear**: GM explicitly selects the cameraman user (no ambiguity)
- ✅ **Simple**: One setting (`broadcastUserId`) instead of detection + fallbacks

**Conclusion**: The user-based approach is more reliable, flexible, and simpler. OBS detection would add complexity without providing meaningful value. **This decision is final and OBS detection will not be implemented.**

## **Future Enhancements / Planned Features**

### **Additional Camera Modes**

#### **GM View Mode**
- **Description**: Mirror the GM's viewport in real-time
- **Use Case**: Stream what the GM sees (useful for show notes, setup, or GM-focused content)
- **Implementation**: Similar to Tracked Mode but specifically tracks the GM user's viewport

#### **Selected Token View Mode**
- **Description**: Follow a manually selected token (GM-controlled selection)
- **Use Case**: GM wants to focus on a specific token/NPC without it being a party member
- **Implementation**: 
  - Add token selection button/UI in broadcast secondary bar
  - Store selected token ID in setting or memory
  - Follow selected token until changed or cleared

### **UI Management Enhancements**

#### **Refresh Cameraman Client Button**
- **Description**: Button in broadcast secondary bar to refresh/reload the cameraman's client
- **Use Case**: Force camera to reset/recenter if something goes wrong, reload viewport state
- **Implementation**: 
  - Add button to broadcast secondary bar
  - Trigger full camera update (pan/zoom to current party tokens)
  - Optionally: send socket message to trigger client reload (if needed)

#### **Auto-Close Image Windows**
- **Description**: Automatically close image popups/windows for broadcast user
- **Use Case**: Images that open during play shouldn't clutter the broadcast view
- **Implementation**: 
  - Hook into image viewer opening events
  - Check if current user is broadcast user
  - Auto-close or prevent opening

#### **Auto-Close Journal Windows**
- **Description**: Automatically close journal entry windows for broadcast user
- **Use Case**: Journal entries opened during play shouldn't block the broadcast view
- **Implementation**: 
  - Hook into journal window opening events
  - Check if current user is broadcast user
  - Auto-close or prevent opening

#### **Hide Combat Tracker**
- **Description**: Option to hide the combat tracker for broadcast user
- **Use Case**: Combat tracker can clutter the broadcast view
- **Implementation**: 
  - Add setting: `broadcastHideCombatTracker` (Boolean)
  - Apply CSS class to hide combat tracker when broadcast mode is active
  - Coordinate with granular UI hiding settings

#### **Options to Hide Squire and Menubar**
- **Description**: Granular controls to hide Squire module UI and Blacksmith menubar
- **Use Case**: Fine-tune what UI elements are visible during broadcast
- **Implementation**: 
  - Add settings: `broadcastHideSquire` (Boolean), `broadcastHideMenubar` (Boolean)
  - Update `_updateBroadcastMode()` to apply/remove CSS classes based on settings
  - Coordinate with existing UI hiding logic

## **Future Enhancements (Other)**

### **Potential Additions (Post-MVP)**

1. **Multiple Broadcast Users**: Support multiple cameramen
3. **Camera Smoothing**: Interpolation for smoother following
4. **Custom Zoom Levels**: Per-mode zoom settings
5. **Broadcast Presets**: Save/load broadcast configurations
6. **Recording Indicators**: Visual indicator when broadcast mode is active
7. **Scene-Specific Settings**: Different modes per scene

## **Questions & Decisions Needed**

### **Open Questions:**

1. **Squire Integration**: How should we coordinate? API call or CSS targeting?
2. **Background Removal**: Remove entirely or just make transparent?
3. **Notification Tray**: Hide by default or keep visible?
4. **Combat Mode Transition**: Auto-switch to combat mode when combat starts?
5. **Multiple Tokens**: In spectator mode, follow one token or pan to encompass all?
6. **Tracked Mode Latency**: How to handle viewport sync delays?

### **Decisions:**

1. ✅ **User-based approach** (not OBS detection)
2. ✅ **Single broadcast user** (not multiple, for MVP)
3. ✅ **OBSERVER permissions** (required for proper visibility)
4. ⏳ **File organization**: Single file vs split? (Start single, split if needed)
5. ⏳ **Background removal**: CSS overlay vs scene modification? (CSS preferred)

## **Summary**

The Broadcast feature uses a **user-based design** where a GM-designated "cameraman" user receives a clean, UI-free view with automatic token following. This approach is:

- **Simple**: One setting (broadcast user ID)
- **Reliable**: No fragile detection mechanisms
- **Powerful**: Multiple following modes and camera controls
- **Consistent**: Reuses existing patterns from Blacksmith

**OBS detection is not needed** for core functionality and can be added later as an optional convenience feature if desired.
