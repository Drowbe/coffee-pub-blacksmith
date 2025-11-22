# window-skillcheck.js Migration Assessment

## Current State
- **File:** `scripts/window-skillcheck.js`
- **Total Lines:** ~1818
- **Linter Errors:** 0 ✅
- **jQuery Instances:** 0 ✅ **MIGRATION COMPLETE**
- **Status:** ✅ **COMPLETE** - All jQuery converted to native DOM

## Core Issue
In FoundryVTT v13, the `html` parameter in hooks like `renderCombatTracker` and `activateListeners` is now a native `HTMLElement` instead of a jQuery object. All jQuery methods on `html` will fail with "is not a function" errors.

## jQuery Usage Analysis

### Critical jQuery Patterns Found (66+ `html.find()` instances):

1. **Element Selection:**
   - `html.find(selector)` → `html.querySelector(selector)` or `html.querySelectorAll(selector)`
   - `html.find(selector).length` → `html.querySelectorAll(selector).length`

2. **Event Handling:**
   - `html.find(selector).click(handler)` → `html.querySelector(selector)?.addEventListener('click', handler)`
   - `html.find(selector).on('click contextmenu', handler)` → Need separate listeners for each event
   - `html.find(selector).change(handler)` → `html.querySelector(selector)?.addEventListener('change', handler)`
   - `html.find(selector).on('input change', handler)` → Separate listeners or use event delegation

3. **Class Manipulation:**
   - `html.find(selector).addClass('class')` → `html.querySelector(selector)?.classList.add('class')`
   - `html.find(selector).removeClass('class')` → `html.querySelector(selector)?.classList.remove('class')`

4. **DOM Traversal:**
   - `html.find(selector).each((i, el) => {})` → `html.querySelectorAll(selector).forEach((el, i) => {})`

5. **Content Manipulation:**
   - `html.find(selector).html('content')` → `html.querySelector(selector).innerHTML = 'content'`
   - `html.find(selector).val()` → `html.querySelector(selector)?.value`
   - `html.find(selector).prop('checked')` → `html.querySelector(selector)?.checked`

6. **Visibility:**
   - `html.find(selector).hide()` → `html.querySelector(selector).style.display = 'none'`
   - `html.find(selector).show()` → `html.querySelector(selector).style.display = ''`

7. **Triggering Events:**
   - `html.find(selector).trigger('click')` → `html.querySelector(selector)?.dispatchEvent(new Event('click'))` or directly call the handler

## Migration Strategy

### Phase 1: Initial Setup (Lines 207-246)
**Scope:** Lines 207-246 in `activateListeners`
- Convert initial filter setup
- Convert token pre-selection logic
- **Risk:** Low - simple selectors and class manipulation

### Phase 2: Actor Selection Handler (Lines 248-293)
**Scope:** Lines 248-293
- Convert `html.find('.cpb-actor-item').on('click contextmenu', ...)`
- Convert defender check logic
- **Risk:** Medium - needs event handler conversion

### Phase 3: Search Handlers (Lines 295-333)
**Scope:** Lines 295-333
- Convert search input handlers
- Convert clear button handlers
- **Risk:** Medium - involves event listeners and DOM manipulation

### Phase 4: Filter Button Handlers (Lines 335-374)
**Scope:** Lines 335-374
- Convert actor filter buttons
- Convert roll type filter buttons
- **Risk:** Medium - button click handlers

### Phase 5: Check Item Selection Handler (Lines 376-676)
**Scope:** Lines 376-676 - LARGEST SECTION
- Complex nested logic with jQuery
- Multiple jQuery calls throughout
- **Risk:** HIGH - Complex logic, many jQuery calls, nested conditionals
- **Strategy:** Break into smaller helper methods, convert section by section

### Phase 6: Roll Button Handler (Lines 678-1006)
**Scope:** Lines 678-1006 - VERY LARGE
- Massive async handler
- Multiple jQuery calls throughout
- **Risk:** HIGH - Large handler, complex logic, many jQuery calls
- **Strategy:** Convert jQuery calls within handler, preserve all logic

### Phase 7: Preference Handlers (Lines 1008-1043)
**Scope:** Lines 1008-1043
- Cancel button
- Preference checkboxes
- DC input handler
- **Risk:** Low-Medium - Standard event handlers

### Phase 8: Helper Methods
**Scope:** Methods that use `this.element.find()` (not `html`)
- `_updateToolList()` - Lines 1046-1168
- `_applyFilter()` - Lines 1171-1223
- `_applyRollTypeFilter()` - Lines 1228-1234
- **Risk:** Medium - These use `this.element` which might still be jQuery in v13 - needs verification

## Critical Considerations

### 1. Variable Scope
- **DO NOT** create duplicate variable declarations
- Reuse variables declared earlier when appropriate
- Use meaningful variable names

### 2. Event Handler Context
- jQuery event handlers automatically bind `this` context
- Native event handlers need explicit binding if needed
- Arrow functions preserve outer `this` context

### 3. QuerySelector Returns
- `querySelector()` returns `null` if not found - must check
- `querySelectorAll()` returns `NodeList` - use `forEach()` not `each()`
- `NodeList` is array-like but not an array - use `Array.from()` if needed

### 4. Event Delegation
- jQuery's `.on()` supports delegation: `html.on('click', '.child', handler)`
- Native: `html.addEventListener('click', (ev) => { if (ev.target.matches('.child')) handler(ev) })`

### 5. Async/Await in Event Handlers
- Keep all async handlers intact
- Don't change promise handling logic

## Testing Checklist

After each phase, verify:
- [ ] No linter errors
- [ ] File structure intact (all braces match)
- [ ] No duplicate variable declarations
- [ ] All event handlers properly bound
- [ ] No syntax errors

## Migration Order (Ranked by Priority)

### Execution Order (Lowest Risk → Highest Risk):

1. **Phase 7: Preference Handlers** (Lines 1008-1043)
   - **Why First:** Smallest section (~35 lines), simple event handlers, no dependencies
   - **Risk:** ⭐ Low
   - **Complexity:** ⭐ Low
   - **Testability:** ✅ Very Easy - Can test checkbox handlers independently
   - **Dependencies:** None

2. **Phase 1: Initial Setup** (Lines 207-246)
   - **Why Second:** Simple selectors and class manipulation, no event handlers, runs once on init
   - **Risk:** ⭐ Low
   - **Complexity:** ⭐ Low
   - **Testability:** ✅ Easy - Initial state setup
   - **Dependencies:** None

3. **Phase 2: Actor Selection Handler** (Lines 248-293)
   - **Why Third:** Isolated functionality, moderate complexity, can test independently
   - **Risk:** ⭐⭐ Low-Medium
   - **Complexity:** ⭐⭐ Medium
   - **Testability:** ✅ Easy - Click handlers are straightforward
   - **Dependencies:** Uses `_updateToolList()` helper (Phase 8)

4. **Phase 3: Search Handlers** (Lines 295-333)
   - **Why Fourth:** Moderate complexity, isolated functionality, no dependencies on other phases
   - **Risk:** ⭐⭐ Low-Medium
   - **Complexity:** ⭐⭐ Medium
   - **Testability:** ✅ Easy - Search/clear functionality
   - **Dependencies:** None

5. **Phase 4: Filter Button Handlers** (Lines 335-374)
   - **Why Fifth:** Moderate complexity, uses helper methods
   - **Risk:** ⭐⭐ Low-Medium
   - **Complexity:** ⭐⭐ Medium
   - **Testability:** ✅ Easy - Button click handlers
   - **Dependencies:** Uses `_applyFilter()` and `_applyRollTypeFilter()` helpers (Phase 8)

6. **Phase 8: Helper Methods** (Lines 1046-1234)
   - **Why Sixth:** These are called BY other phases, so need to convert BEFORE complex phases
   - **Risk:** ⭐⭐⭐ Medium
   - **Complexity:** ⭐⭐ Medium
   - **Testability:** ⚠️ Moderate - Need to verify `this.element` behavior in v13
   - **Dependencies:** None - but called by Phase 2, 4, 5
   - **Note:** Uses `this.element.find()` - need to verify if `this.element` is still jQuery in v13

7. **Phase 5: Check Item Selection Handler** (Lines 376-676)
   - **Why Seventh:** VERY LARGE section (300 lines), complex nested logic, many jQuery calls
   - **Risk:** ⭐⭐⭐⭐ High
   - **Complexity:** ⭐⭐⭐⭐ Very High
   - **Testability:** ⚠️ Difficult - Complex nested conditionals, many edge cases
   - **Dependencies:** Uses helper methods (Phase 8) - do those first

8. **Phase 6: Roll Button Handler** (Lines 678-1006)
   - **Why Last:** LARGEST section (328 lines), most complex logic, critical functionality
   - **Risk:** ⭐⭐⭐⭐⭐ Very High
   - **Complexity:** ⭐⭐⭐⭐⭐ Very High
   - **Testability:** ⚠️ Very Difficult - Async handlers, complex state management
   - **Dependencies:** Uses helper methods (Phase 8), called by Phase 5

### Rationale for Order:

1. **Start Small:** Begin with simplest sections to build confidence and establish patterns
2. **Test Early:** Convert easy sections first to ensure migration approach works
3. **Build Up:** Progress from simple to complex, using patterns established early
4. **Resolve Dependencies:** Do helper methods (Phase 8) before complex sections that use them
5. **Save Hardest for Last:** Tackle largest, most complex sections after gaining experience

## Patterns to Follow

### Pattern 1: Simple Query
```javascript
// jQuery
const item = html.find('.selector');
if (item.length) { /* ... */ }

// Native DOM
const item = html.querySelector('.selector');
if (item) { /* ... */ }
```

### Pattern 2: Multiple Elements
```javascript
// jQuery
html.find('.selector').each((i, el) => {
    // ...
});

// Native DOM
html.querySelectorAll('.selector').forEach((el, i) => {
    // ...
});
```

### Pattern 3: Event Handler
```javascript
// jQuery
html.find('.button').click(handler);

// Native DOM
const button = html.querySelector('.button');
if (button) {
    button.addEventListener('click', handler);
}
```

### Pattern 4: Class Manipulation
```javascript
// jQuery
html.find('.item').addClass('active');

// Native DOM
html.querySelectorAll('.item').forEach(el => {
    el.classList.add('active');
});
```

## Anti-Patterns to Avoid

1. **DON'T** create duplicate `const` declarations in same scope
2. **DON'T** mix jQuery and native DOM in same section
3. **DON'T** forget null checks with `querySelector()`
4. **DON'T** change indentation or code structure unnecessarily
5. **DON'T** modify logic while migrating - only change DOM access patterns

## Execution Summary

**Total Phases:** 8  
**Estimated Lines to Convert:** ~1050 lines (out of 1655 total)  
**Starting Point:** Phase 7 (Preference Handlers) - ~35 lines  
**Ending Point:** Phase 6 (Roll Button Handler) - ~328 lines  

**Key Strategy:**
1. Convert helper methods (Phase 8) before complex sections that use them
2. Test after each phase completion
3. Don't move forward until linter shows 0 errors
4. Only change DOM access patterns, preserve all logic

## Migration Status: ✅ **COMPLETE**

**Completed:** All 8 phases successfully migrated
**Date Completed:** 2025-01-XX
**Final Status:** 0 linter errors, all functionality tested and working

### Issues Encountered and Fixed

1. **jQuery Detection in `activateListeners`**
   - **Issue:** `html` parameter was still a jQuery object in some cases
   - **Fix:** Added jQuery detection and conversion at start of method
   - **Pattern:** `const htmlElement = html.jquery ? html[0] : html`

2. **jQuery Detection in `handleChatMessageClick`**
   - **Issue:** `renderChatMessage` hook still passes jQuery objects
   - **Fix:** Added dual-compatibility handling for both jQuery and native DOM

3. **jQuery Detection in `_updateToolList`**
   - **Issue:** `this.element` was still a jQuery object
   - **Fix:** Added jQuery detection and conversion at start of method

4. **Helper Methods (`_applyFilter`, `_applyRollTypeFilter`)**
   - **Issue:** Methods received jQuery objects from callers
   - **Fix:** Added jQuery detection and conversion in both methods

### Key Learnings

- FoundryVTT v13 Application classes may still pass jQuery objects in some contexts
- Need to handle both jQuery and native DOM for compatibility
- Pattern: Check for `html.jquery` property to detect jQuery objects
- Extract native DOM with `html[0]` or `html.get(0)` for jQuery objects

### Testing Status

- ✅ Dialog opens without errors
- ✅ All click events working
- ✅ Actor selection functional
- ✅ Search functionality working
- ✅ Filter buttons working
- ✅ Check item selection working
- ✅ Roll button functional
- ✅ Preferences saving correctly
- ✅ Tool list updates correctly

