# Phase 4 Implementation Plan: Basic Following (Camera Control)

## **Overview**

Phase 4 implements the core camera following functionality for the broadcast feature. This includes:
- **Spectator Mode**: Automatically follow party tokens (player characters)
- **Combat Mode**: Follow the current combatant's token
- **Manual Mode**: No automatic following (user controls camera)
- **Background Removal**: Hide scene background when enabled

## **Decisions Made**

### **1. Mode Selection and Storage**
- **Decision**: Controls in the broadcast secondary bar (buttons/selector)
- **Implementation**: Mode selector buttons in the broadcast secondary bar
- **Storage**: `broadcastMode` setting (synced with bar controls)

### **2. Spectator Mode — Token Filtering**
- **Decision**: Only player character tokens (party tokens)
- **Pattern**: `actor.type === 'character' && actor.hasPlayerOwner`
- **Visibility Check**: Use `token.testUserVisibility(broadcastUser)` to respect vision
- **Zoom**: GM-configurable zoom level per single token

### **3. Spectator Mode — Multiple Tokens**
- **Decision**: Average position (center all visible party tokens on screen)
- **Implementation**: Calculate center point of all visible party tokens, pan to that center
- **Zoom**: GM-configurable zoom level for token groups

### **4. Camera Animation Behavior**
- **Decision**: Smooth animation using `canvas.animatePan()`
- **Implementation**: Use Foundry's native `canvas.animatePan({ x, y })` API

### **5. Camera Following — Throttling**
- **Decision**: Distance threshold (only pan if token moves > X pixels)
- **Implementation**: Only trigger pan if token movement exceeds threshold
- **Default**: 1 grid unit (configurable via `broadcastFollowDistanceThreshold`)

### **6. Zoom Level During Following**
- **Decision**: Setting to choose behavior
- **Settings**:
  - `broadcastSpectatorZoomSingle` (Number): Zoom level for single token following (default: current zoom)
  - `broadcastSpectatorZoomMultiple` (Number): Zoom level for multiple token following (default: calculated to fit all tokens)
- **Implementation**: Apply zoom when following tokens, respect settings

### **7. Combat Following Mode**
- **Decision**: On turn change (`updateCombat` hook)
- **Implementation**: Hook `updateCombat`, call `MenuBar.panToCombatant()` on turn change
- **Reuse**: Leverage existing `MenuBar.panToCombatant(combatantId)` function

### **8. Background Removal**
- **Decision**: CSS opacity with setting toggle
- **Implementation**: Add CSS class when background hiding is enabled
- **Setting**: `broadcastHideBackground` (Boolean, default: `true`)

### **9. Phase 4 Scope**
- **Modes Included**: Spectator + Combat + Manual + Background removal
- **Future Modes** (Not in Phase 4): GM View, Birds-eye, Selected Token

### **10. Settings Required**

#### **Core Settings**
1. `broadcastMode` (Select)
   - Options: `"spectator"`, `"combat"`, `"manual"`
   - Default: `"spectator"`
   - Scope: World
   - Description: Camera following mode for broadcast

2. `broadcastFollowDistanceThreshold` (Number)
   - Default: 1 (grid unit)
   - Scope: World
   - Description: Minimum token movement (in grid units) required to trigger camera pan

3. `broadcastFollowThrottleMs` (Number)
   - Default: 100 (milliseconds)
   - Scope: World
   - Description: Minimum time between camera pan operations

4. `broadcastHideBackground` (Boolean)
   - Default: `true`
   - Scope: World
   - Description: Hide scene background in broadcast mode

#### **Zoom Settings**
5. `broadcastSpectatorZoomSingle` (Number)
   - Default: `1.0` (current zoom level - no change)
   - Scope: World
   - Description: Zoom level when following a single party token
   - Hint: "1.0 = no zoom change, 0.5 = zoom out 2x, 2.0 = zoom in 2x"

6. `broadcastSpectatorZoomMultiple` (Number)
   - Default: `0` (auto-calculate to fit all tokens)
   - Scope: World
   - Description: Zoom level when following multiple party tokens (0 = auto-fit)
   - Hint: "0 = auto-fit to show all tokens, or specify zoom level (0.5-2.0)"

## **Implementation Steps**

### **Step 1: Add Settings**

**File**: `scripts/settings.js`
- Add settings under "Broadcast" H2 section
- Order: `broadcastMode`, `broadcastFollowDistanceThreshold`, `broadcastFollowThrottleMs`, `broadcastHideBackground`, `broadcastSpectatorZoomSingle`, `broadcastSpectatorZoomMultiple`
- Add localization strings in `lang/en.json`

### **Step 2: Extend BroadcastManager with Camera Logic**

**File**: `scripts/manager-broadcast.js`

Add methods:
- `_registerCameraHooks()`: Register hooks for token movement and combat updates
- `_onTokenUpdate()`: Handle token position changes (spectator mode)
- `_onCombatUpdate()`: Handle combat turn changes (combat mode)
- `_followSpectatorTokens()`: Calculate and pan to party token positions
- `_calculateTokenCenter()`: Calculate center point of multiple tokens
- `_applyZoom()`: Apply zoom level based on mode and settings
- `_shouldPan()`: Check if pan should be triggered (distance threshold + throttle)

### **Step 3: Create Broadcast Secondary Bar UI**

**File**: `scripts/api-menubar.js` (or create `scripts/broadcast-ui.js`)

**Approach**: Use default secondary bar system (tool-based)

Register secondary bar items for mode selection:
- `broadcast-mode-spectator`: Button for Spectator mode
- `broadcast-mode-combat`: Button for Combat mode  
- `broadcast-mode-manual`: Button for Manual mode

**Styling**: Use existing `.secondary-bar-item` classes (same as combat bar buttons)

### **Step 4: Add Background Removal CSS**

**File**: `styles/broadcast.css`

Add CSS rule:
```css
/* Hide scene background when broadcastHideBackground is enabled */
.broadcast-mode.hide-background canvas.background {
    opacity: 0 !important;
    visibility: hidden !important;
}
```

**Manager Logic**: Add/remove `hide-background` class on body based on setting

### **Step 5: Integrate with Existing Systems**

**Reuse**:
- `MenuBar.panToCombatant()` for combat following
- `canvas.animatePan()` for camera movement
- `matchUserBySetting()` for user identification
- Secondary bar system for UI

**Hooks**:
- `updateToken` (priority 3) - for spectator mode
- `updateCombat` (priority 3) - for combat mode
- `canvasReady` - initialize camera following on scene load
- `sceneReady` - reset camera state on scene change

## **Technical Details**

### **Token Filtering (Spectator Mode)**

```javascript
// Get all party tokens visible to broadcast user
const partyTokens = canvas.tokens.placeables.filter(token => {
    const actor = token.actor;
    // Must be player character
    if (!actor || actor.type !== 'character' || !actor.hasPlayerOwner) {
        return false;
    }
    // Must be visible to broadcast user
    const broadcastUser = game.users.get(broadcastUserId);
    if (broadcastUser && token.document.testUserVisibility) {
        return token.document.testUserVisibility(broadcastUser);
    }
    return true; // Fallback if visibility check unavailable
});
```

### **Average Position Calculation**

```javascript
// Calculate center point of multiple tokens
_calculateTokenCenter(tokens) {
    if (!tokens || tokens.length === 0) return null;
    
    let sumX = 0;
    let sumY = 0;
    
    tokens.forEach(token => {
        // Token center position (x, y are top-left, so add half dimensions)
        sumX += token.x + (token.width * canvas.grid.size / 2);
        sumY += token.y + (token.height * canvas.grid.size / 2);
    });
    
    return {
        x: sumX / tokens.length,
        y: sumY / tokens.length
    };
}
```

### **Distance Threshold Check**

```javascript
// Store last pan position to calculate movement
static _lastPanPosition = { x: null, y: null };

_shouldPan(newPosition, threshold) {
    if (!this._lastPanPosition.x || !this._lastPanPosition.y) {
        return true; // First pan, always allow
    }
    
    const distance = Math.sqrt(
        Math.pow(newPosition.x - this._lastPanPosition.x, 2) +
        Math.pow(newPosition.y - this._lastPanPosition.y, 2)
    );
    
    // Convert pixels to grid units
    const gridUnits = distance / canvas.grid.size;
    
    return gridUnits >= threshold;
}
```

### **Throttling Logic**

```javascript
static _lastPanTime = 0;

_shouldPanByTime(throttleMs) {
    const now = Date.now();
    if (now - this._lastPanTime >= throttleMs) {
        this._lastPanTime = now;
        return true;
    }
    return false;
}
```

### **Zoom Application**

```javascript
_applyZoom(zoomLevel, tokens) {
    if (zoomLevel <= 0) {
        // Auto-calculate zoom to fit tokens
        if (tokens && tokens.length > 1) {
            // Calculate bounds and fit to screen
            const bounds = this._calculateTokenBounds(tokens);
            const zoom = this._calculateFitZoom(bounds);
            canvas.animateZoom(zoom);
        }
    } else {
        // Apply specified zoom level
        canvas.animateZoom(zoomLevel);
    }
}
```

## **File Changes Summary**

### **New Files**
- None (all functionality in existing `manager-broadcast.js`)

### **Modified Files**

1. **`scripts/settings.js`**
   - Add 6 new settings under "Broadcast" H2 section

2. **`scripts/manager-broadcast.js`**
   - Add camera following methods
   - Add hook registrations for token/combat updates
   - Add background removal class management

3. **`scripts/api-menubar.js`**
   - Register broadcast secondary bar items (mode selector buttons)

4. **`lang/en.json`**
   - Add localization strings for new settings

5. **`styles/broadcast.css`**
   - Add `.hide-background` CSS rule

## **Testing Checklist**

- [ ] Spectator mode follows single party token on movement
- [ ] Spectator mode centers multiple party tokens (average position)
- [ ] Spectator mode respects distance threshold (doesn't pan on tiny movements)
- [ ] Spectator mode respects throttle (doesn't pan too frequently)
- [ ] Spectator mode applies zoom settings correctly (single vs multiple tokens)
- [ ] Combat mode follows current combatant on turn change
- [ ] Combat mode works with existing `MenuBar.panToCombatant()`
- [ ] Manual mode doesn't automatically follow anything
- [ ] Background removal hides scene background when enabled
- [ ] Mode selector buttons in secondary bar work correctly
- [ ] Mode selection persists across reloads (via setting)
- [ ] Camera following only works for broadcast user (not other users)

## **Future Enhancements (Not in Phase 4)**

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

- GM View mode (mirror GM's viewport)
- Birds-eye mode (fit entire map to screen)
- Selected Token mode (follow GM-selected tokens)
- Custom zoom levels per mode
- Smooth interpolation for camera movement