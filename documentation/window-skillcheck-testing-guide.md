# window-skillcheck.js Testing Guide

## Pre-Testing Checklist

Before testing, ensure:
- ✅ FoundryVTT v13 is running
- ✅ Module is loaded without console errors
- ✅ No linter errors in the file (0 errors confirmed)
- ✅ Browser console is open (F12) to catch any runtime errors

## Testing Steps

### 1. Open the Skill Check Dialog

**How to trigger:**
- Look for the skill check button/feature in your module's UI
- Check if there's a hotkey or menu option
- Verify the dialog opens without errors

**What to check:**
- [ ] Dialog opens successfully
- [ ] No console errors when opening
- [ ] All three columns are visible (Actors, Roll Types, Check Items)

### 2. Test Actor Selection (Phase 2)

**Actions:**
1. Click on an actor in the left column
2. Right-click on an actor
3. Select multiple actors
4. Try selecting both challengers (left-click) and defenders (right-click)

**What to check:**
- [ ] Left-click adds actor to challengers (swords icon)
- [ ] Right-click adds actor to defenders (shield icon)
- [ ] Clicking again deselects the actor
- [ ] Group indicators update correctly
- [ ] Tool list updates when actors are selected/deselected

### 3. Test Search Functionality (Phase 3)

**Actions:**
1. Type in the search box in the actor column
2. Type in the search box in the check items column
3. Click the clear button (X) in search boxes
4. Search while filters are active

**What to check:**
- [ ] Actor search filters actors by name
- [ ] Check item search filters items
- [ ] Clear button appears when typing
- [ ] Clear button clears the search and shows all items
- [ ] Search works with active filters

### 4. Test Filter Buttons (Phase 4)

**Actions:**
1. Click actor filter buttons (Party, Selected, Canvas, Monster)
2. Click roll type filter buttons (Quick, Skill, Ability, Save, Tool)
3. Combine filters with search

**What to check:**
- [ ] Actor filters show/hide correct actors
- [ ] Roll type filters show/hide correct sections
- [ ] Active filter button is highlighted
- [ ] Filters work with search terms
- [ ] Pre-selected tokens work with "Selected" filter

### 5. Test Check Item Selection (Phase 5)

**Actions:**
1. Click on a skill/ability/save check item
2. Right-click on a check item
3. Select quick roll items
4. Test contested rolls (with both challengers and defenders selected)
5. Test party rolls
6. Test tool selection

**What to check:**
- [ ] Left-click selects challenger roll (swords icon)
- [ ] Right-click selects defender roll (shield icon)
- [ ] Clicking again deselects
- [ ] Quick rolls auto-trigger roll button
- [ ] Contested rolls allow separate challenger/defender selections
- [ ] Party rolls select all party members
- [ ] Tool selection works (if all actors have the tool)
- [ ] Unavailable tools show warning

### 6. Test Roll Button (Phase 6)

**Actions:**
1. Select actors and a check item
2. Set DC value
3. Toggle checkboxes (Show DC, Group Roll, Show Explanation, Cinematic)
4. Click the Roll button
5. Test with different roll modes

**What to check:**
- [ ] Roll button is clickable
- [ ] Roll executes without errors
- [ ] Chat message appears with results
- [ ] DC input value is used correctly
- [ ] Checkboxes save preferences
- [ ] Group roll works when enabled
- [ ] Cinematic mode works (if applicable)
- [ ] Roll mode (Public/Private/etc.) works

### 7. Test Preference Handlers (Phase 7)

**Actions:**
1. Toggle "Show Roll Explanation" checkbox
2. Toggle "Show DC" checkbox
3. Toggle "Group Roll" checkbox
4. Toggle "Cinematic" checkbox
5. Change DC input value
6. Close and reopen dialog

**What to check:**
- [ ] Checkboxes toggle correctly
- [ ] Preferences are saved
- [ ] Preferences persist after closing/reopening
- [ ] DC input updates display
- [ ] DC input clears to "--" when empty

### 8. Test Helper Methods (Phase 8)

**Actions:**
1. Select/deselect actors and watch tool list update
2. Change actor filters
3. Change roll type filters

**What to check:**
- [ ] Tool list updates when actors change
- [ ] Actor filter applies correctly
- [ ] Roll type filter shows/hides sections
- [ ] Defender removal clears defender roll selections

### 9. Test Edge Cases

**Actions:**
1. Open dialog with tokens already selected on canvas
2. Select defenders without challengers
3. Try to select defender roll without defenders
4. Select all actors, then deselect all
5. Use search with no results
6. Try to roll with no actors selected
7. Try to roll with no check item selected

**What to check:**
- [ ] Pre-selected tokens are highlighted
- [ ] Warnings appear for invalid selections
- [ ] Empty states handled gracefully
- [ ] No console errors in edge cases

### 10. Test Chat Message Interaction (handleChatMessageClick)

**Actions:**
1. Perform a roll
2. Click on roll buttons in the chat message
3. Test cinematic display (if applicable)

**What to check:**
- [ ] Chat message renders correctly
- [ ] Click handlers on chat buttons work
- [ ] Roll buttons in chat execute correctly
- [ ] No console errors when clicking chat elements

## Console Monitoring

**Watch for these errors:**
- `html.find is not a function` - jQuery not fully converted
- `Cannot read property 'querySelector' of null` - Missing null checks
- `addEventListener is not a function` - Element not found
- Any other JavaScript errors

**Good signs:**
- No errors in console
- All functionality works as expected
- Smooth interactions

## Quick Test Script

If you have access to the browser console, you can run:

```javascript
// Check if dialog can be instantiated
const dialog = new SkillCheckDialog();
console.log('Dialog created:', dialog);

// Check if activateListeners receives native DOM
// (This would require hooking into the render process)
```

## Reporting Issues

If you find issues, note:
1. **What action** triggered the error
2. **Console error message** (if any)
3. **Expected behavior** vs **actual behavior**
4. **Steps to reproduce**

## Success Criteria

✅ All 8 phases tested and working
✅ No console errors
✅ All UI interactions functional
✅ Preferences persist
✅ Rolls execute correctly
✅ Chat messages render properly

