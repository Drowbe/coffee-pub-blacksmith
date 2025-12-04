# Testing Plan: Deprecation Warning Fixes

This document outlines how to test the v13 deprecation warning fixes made in this update.

## Pre-Testing Setup

1. **Clear Browser Console**: Open FoundryVTT and clear the browser console (F12 → Console → Clear)
2. **Reload Foundry**: Press `F5` or `Ctrl+R` to reload the application
3. **Enable Debug Mode**: If available, enable debug mode in module settings to see all console messages

## Test Checklist

### ✅ 1. Console Deprecation Warnings Check

**Goal**: Verify no deprecation warnings appear in console

**Steps**:
1. Open browser console (F12)
2. Reload FoundryVTT (F5)
3. Watch console during initial load
4. Check for these specific warnings (should NOT appear):
   - ❌ `"You are accessing the global "CanvasLayer"...`
   - ❌ `"You are accessing the global "loadTemplates"...`
   - ❌ `"You are accessing the global "renderTemplate"...`
   - ❌ `"SceneControls#activeControl is deprecated...`
   - ❌ `"SceneControls#activeTool is deprecated...`
   - ❌ `"You are accessing the global "Token"...`

**Expected Result**: No deprecation warnings for the above APIs

---

### ✅ 2. CanvasLayer Test

**Goal**: Verify custom canvas layer still works

**Steps**:
1. Load a scene with tokens
2. Check console for: `"BlacksmithLayer: Initialized"` message
3. Verify no errors related to canvas layer initialization
4. (Optional) If layer has UI, verify it appears/works correctly

**Expected Result**: Layer initializes without errors, console shows initialization message

**Files Changed**: `scripts/canvas-layer.js`

---

### ✅ 3. Template Loading Test (loadTemplates)

**Goal**: Verify templates load correctly

**Steps**:
1. Load FoundryVTT
2. Check console for any template loading errors
3. Verify menubar appears (if enabled)
4. Verify no errors about missing templates

**Expected Result**: All templates load successfully, menubar renders correctly

**Files Changed**: `scripts/api-menubar.js`

---

### ✅ 4. Template Rendering Test (renderTemplate)

**Goal**: Verify all template rendering still works

**Test Each Feature**:

#### 4a. Menubar Templates
- **Steps**: 
  - Verify menubar displays correctly
  - Click various menubar buttons
  - Verify chat messages appear with correct formatting
- **Expected**: Menubar works, chat cards render properly

#### 4b. Skill Check Dialog
- **Steps**:
  - Open CoffeePub toolbar
  - Click "Request a Roll" button
  - Verify dialog opens and renders correctly
  - Submit a roll
  - Verify roll card appears in chat
- **Expected**: Dialog opens, roll card renders in chat

#### 4c. XP Distribution
- **Steps**:
  - Trigger XP distribution (if available)
  - Verify XP cards appear in chat
- **Expected**: XP cards render correctly

#### 4d. Vote System
- **Steps**:
  - Create a vote (if available)
  - Verify vote cards render in chat
- **Expected**: Vote cards render correctly

#### 4e. Token Movement
- **Steps**:
  - Move a token on the canvas
  - Verify movement cards appear in chat (if enabled)
- **Expected**: Movement cards render correctly

#### 4f. Combat Stats
- **Steps**:
  - Enter combat
  - Verify combat stat cards render (if enabled)
- **Expected**: Combat stat cards render correctly

#### 4g. Timers
- **Steps**:
  - Start a timer (round/planning/combat)
  - Verify timer UI renders correctly
- **Expected**: Timer UI renders correctly

**Files Changed**: 
- `scripts/api-menubar.js`
- `scripts/blacksmith.js`
- `scripts/xp-manager.js`
- `scripts/window-skillcheck.js`
- `scripts/vote-manager.js`
- `scripts/token-movement.js`
- `scripts/timer-round.js`
- `scripts/timer-planning.js`
- `scripts/timer-combat.js`
- `scripts/token-image-utilities.js`
- `scripts/stats-combat.js`
- `scripts/token-handler.js`

---

### ✅ 5. Toolbar Control Test (activeControl/activeTool)

**Goal**: Verify toolbar switching and tool activation works

**Steps**:
1. **Toolbar Switching**:
   - Click CoffeePub toolbar button (mug icon)
   - Verify toolbar opens without errors
   - Click another toolbar (e.g., Tokens, Lights)
   - Verify switching works smoothly
   - Switch back to CoffeePub toolbar
   - Verify no errors in console

2. **Tool Activation**:
   - Open CoffeePub toolbar
   - Click various tool buttons (Request Roll, Vote, etc.)
   - Verify tools activate correctly
   - Verify dialogs/windows open as expected

3. **Leader Tool Test** (if applicable):
   - Change party leader
   - Verify leader-only tools appear/disappear correctly
   - Verify no errors when tools are removed

**Expected Result**: 
- Toolbar switching works without errors
- Tools activate correctly
- No `Cannot read properties of undefined (reading 'onChange')` errors
- No deprecation warnings about `activeControl` or `activeTool`

**Files Changed**: `scripts/manager-toolbar.js`

---

### ✅ 6. Token Wrapper Test (libWrapper Token)

**Goal**: Verify token drawing wrapper still works

**Steps**:
1. Place a token on the canvas
2. Verify token draws correctly
3. Move token
4. Verify token redraws correctly
5. Check console for any errors related to token drawing

**Expected Result**: 
- Tokens draw and redraw correctly
- No errors in console
- No deprecation warnings about `Token`

**Files Changed**: `scripts/manager-libwrapper.js`

---

## Quick Smoke Test (5 minutes)

If you're short on time, do this minimal test:

1. **Load Foundry**: Reload and check console for deprecation warnings
2. **Open Toolbar**: Click CoffeePub toolbar button
3. **Click Tool**: Click "Request a Roll" button
4. **Verify**: Dialog opens, no console errors
5. **Switch Toolbars**: Click another toolbar, then back
6. **Verify**: No errors when switching

**Expected**: Everything works, no deprecation warnings

---

## Known External Deprecations (Not Our Code)

These warnings may still appear but are from external modules/systems:
- `ActorSheetMixin` - From DnD5e system
- `renderChatMessage` - From DnD5e system (if they use the old hook)
- `The V1 Application framework` - From modules using ApplicationV1 (we use it for some dialogs, but those are marked as acceptable)

These are **not** errors in our code and can be ignored.

---

## Reporting Issues

If you find any issues:

1. **Note the exact error message** from console
2. **Note which test step failed**
3. **Note what you were doing** when it failed
4. **Check console** for full stack trace
5. **Take screenshot** of console if possible

---

## Success Criteria

✅ **All tests pass** if:
- No deprecation warnings for our fixed APIs
- All features work as before
- No new errors in console
- Toolbar switching works smoothly
- Templates render correctly
- Tokens draw correctly

