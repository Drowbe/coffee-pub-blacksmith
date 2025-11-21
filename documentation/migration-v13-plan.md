# FoundryVTT v12 to v13 Migration Plan

## Executive Summary

This document outlines a comprehensive migration plan for Coffee Pub Blacksmith module from FoundryVTT v12 to v13. The migration addresses two major breaking changes:

1. **`getSceneControlButtons` Hook API Change** - Controls changed from array to object structure
2. **jQuery Removal** - All jQuery-dependent code must migrate to native DOM methods

**Migration Strategy:** v13-only (no dual compatibility)
- **v12 Final Release:** 12.1.22 (locked and tagged)
- **v13 Development:** Starting from v13.0.0
- **No Backward Compatibility:** Clean break simplifies migration

**Total Estimated Effort:** 35-50 hours (reduced from 40-60 due to no dual-compatibility)
- **Critical Path:** 18-25 hours (blocks v13 functionality)
- **Full Migration:** 35-50 hours (includes ApplicationV2 migration)

---

## Current State Analysis

### Codebase Statistics
- **Total JavaScript Files:** 47 files
- **Application Classes:** 8 classes identified
- **Affected Files by Category:**
  - `getSceneControlButtons` hook: 1 file (`manager-toolbar.js`)
  - `renderCombatTracker` hooks: 5+ files
  - jQuery usage: 19 files with `html.find()` (221 instances)
  - jQuery selectors: 14 files with `$(` (115 instances)
  - jQuery DOM methods: 26 files (284 instances)

### Application Classes Identified
1. `RollWindow` - extends `Application`
2. `SkillCheckDialog` - extends `Application`
3. `TokenImageReplacementWindow` - extends `Application`
4. `CSSEditor` - extends `FormApplication`
5. `BlacksmithWindowQuery` - extends `FormApplication`
6. `StatsWindow` - extends `Application`
7. `VoteConfig` - extends `Application`
8. `XpDistributionWindow` - extends `FormApplication`

---

## Migration Phases

### Phase 0: Lock Down v12 Release
**Priority:** 🔴 Critical  
**Estimated Effort:** 1 hour  
**Timeline:** Before starting migration

#### 0.1 Finalize v12 Release
**Tasks:**
- [ ] Ensure v12.1.22 is stable and tested
- [ ] Create git tag: `v12.1.22` (or `v12.1.22-final`)
- [ ] Create GitHub release for v12.1.22
- [ ] Update README to note v12.1.22 as final v12 release
- [ ] Document v12 support end date
- [ ] Create `v12-maintenance` branch (optional, for critical v12 fixes only)

**Note:** After this point, all development focuses on v13 only.

---

### Phase 1: Critical Fixes (Blocks v13 Compatibility)
**Priority:** 🔴 Critical  
**Estimated Effort:** 6-10 hours (reduced from 8-12, no dual-compatibility)  
**Timeline:** 1-2 days

#### 1.1 Fix `getSceneControlButtons` Hook
**File:** `scripts/manager-toolbar.js`  
**Effort:** 2-3 hours

**Tasks:**
- [ ] Replace `controls.findIndex()` with object property check
- [ ] Replace `controls.splice()` with object deletion
- [ ] Replace `controls.push()` with object property assignment
- [ ] Replace `controls.find()` with direct property access
- [ ] Update tools handling (array → object)
- [ ] Use v13-only patterns (no dual-compatibility needed)
- [ ] Test toolbar functionality

**Complexity:** Medium - Requires understanding of controls structure changes  
**Note:** v13-only approach simplifies implementation (no version checks needed)

#### 1.2 Fix `renderCombatTracker` Hooks
**Files:** 5 files affected
- `scripts/combat-tools.js` (14 instances)
- `scripts/combat-tracker.js` (2 instances)
- `scripts/timer-planning.js` (4 instances)
- `scripts/timer-round.js` (2 instances)
- `scripts/timer-combat.js` (6 instances)

**Effort:** 4-6 hours (1-1.5 hours per file)

**Tasks Per File:**
- [ ] Replace `html.find()` with `html.querySelectorAll()` or `html.querySelector()`
- [ ] Replace `.each()` with `.forEach()`
- [ ] Replace `.append()`, `.before()`, `.after()` with native DOM methods
- [ ] Replace `.remove()` with native `.remove()` (same API)
- [ ] Update length checks for NodeLists
- [ ] Replace `$(element)` with native element handling
- [ ] Test combat tracker functionality

**Complexity:** Medium - Systematic jQuery → DOM conversion

#### 1.3 Testing Critical Path
**Effort:** 2-3 hours

**Tasks:**
- [ ] Test scene controls in v13
- [ ] Test combat tracker rendering
- [ ] Test timer functionality
- [ ] Verify no console errors
- [ ] Smoke test core module features

---

### Phase 2: jQuery Removal (Remaining Files)
**Priority:** 🟡 High  
**Estimated Effort:** 10-15 hours (reduced from 12-18, no dual-compatibility)  
**Timeline:** 2-3 days

#### 2.1 High-Impact Files (Most jQuery Usage)
**Files:** 5 files with significant jQuery usage
- `scripts/window-skillcheck.js` (66 instances)
- `scripts/window-query.js` (23 instances)
- `scripts/window-gmtools.js` (26 instances)
- `scripts/journal-tools.js` (12 instances)
- `scripts/encounter-toolbar.js` (10 instances)

**Effort:** 8-12 hours (1.5-2.5 hours per file)

**Tasks Per File:**
- [ ] Audit all jQuery usage
- [ ] Replace jQuery selectors
- [ ] Replace jQuery DOM manipulation
- [ ] Replace jQuery event handlers
- [ ] Test functionality thoroughly

**Complexity:** High - Complex UI interactions may require careful testing

#### 2.2 Medium-Impact Files
**Files:** 9 files with moderate jQuery usage
- `scripts/token-image-replacement.js` (16 instances)
- `scripts/blacksmith.js` (10 instances)
- `scripts/xp-manager.js` (18 instances)
- `scripts/token-image-utilities.js` (24 instances)
- `scripts/api-menubar.js` (39 instances)
- `scripts/combat-tools.js` (19 instances)
- `scripts/timer-planning.js` (11 instances)
- `scripts/timer-combat.js` (8 instances)
- `scripts/manager-rolls.js` (5 instances)

**Effort:** 4-6 hours (30-45 minutes per file)

**Tasks Per File:**
- [ ] Replace jQuery methods systematically
- [ ] Test affected features
- [ ] Verify no regressions

**Complexity:** Medium - Straightforward conversions

---

### Phase 3: ApplicationV2 Migration
**Priority:** 🟢 Medium  
**Estimated Effort:** 12-20 hours (reduced from 15-25, v13-only patterns)  
**Timeline:** 4-6 days

**Note:** This phase is optional for initial v13 compatibility. Applications will continue to work in v13 but should be migrated to ApplicationV2 for optimal performance and future-proofing.

#### 3.1 Application Class Audit
**Effort:** 2-3 hours

**Tasks:**
- [ ] Document all Application classes and their usage
- [ ] Identify ApplicationV2 migration requirements for each
- [ ] Prioritize applications by usage frequency
- [ ] Create migration checklist per application

#### 3.2 Simple Applications (Lower Complexity)
**Applications:** 4 classes
- `RollWindow`
- `StatsWindow`
- `VoteConfig`
- `XpDistributionWindow`

**Effort:** 8-12 hours (2-3 hours per application)

**Migration Tasks Per Application:**
- [ ] Convert to ApplicationV2 class structure
- [ ] Update `getData()` → `async getData()`
- [ ] Update event handling to new API
- [ ] Migrate templates if needed
- [ ] Test thoroughly

**Complexity:** Medium - Well-documented migration path

#### 3.3 Complex Applications (Higher Complexity)
**Applications:** 4 classes
- `SkillCheckDialog` (large, complex UI)
- `TokenImageReplacementWindow` (very large, complex interactions)
- `BlacksmithWindowQuery` (large FormApplication)
- `CSSEditor` (FormApplication with special handling)

**Effort:** 5-10 hours (1.5-2.5 hours per application)

**Migration Tasks Per Application:**
- [ ] Convert to ApplicationV2 structure
- [ ] Update complex interactions
- [ ] Migrate form handling (for FormApplications)
- [ ] Test all features thoroughly
- [ ] Verify performance improvements

**Complexity:** High - More complex state management and interactions

---

### Phase 4: Testing & Validation
**Priority:** 🔴 Critical  
**Estimated Effort:** 4-6 hours (reduced from 5-8, no v12 testing needed)  
**Timeline:** 1-2 days

#### 4.1 Unit Testing
**Effort:** 2-3 hours

**Tasks:**
- [ ] Test all migrated hooks
- [ ] Test all Application classes
- [ ] Test jQuery replacements
- [ ] Verify no console errors
- [ ] Test in both v12 and v13 (if dual-compatibility)

#### 4.2 Integration Testing
**Effort:** 2-3 hours

**Tasks:**
- [ ] Test module with other popular modules
- [ ] Test combat tracker interactions
- [ ] Test scene controls with other modules
- [ ] Test window dialogs and forms
- [ ] Performance testing

#### 4.3 User Acceptance Testing
**Effort:** 1-2 hours

**Tasks:**
- [ ] Test all user-facing features
- [ ] Test all settings and configurations
- [ ] Verify all functionality works as expected
- [ ] Test edge cases and error handling

---

### Phase 5: Documentation & Cleanup
**Priority:** 🟢 Low  
**Estimated Effort:** 2-3 hours  
**Timeline:** 1 day

#### 5.1 Code Documentation
**Effort:** 1 hour

**Tasks:**
- [ ] Update code comments for v13 patterns
- [ ] Document any v13-specific implementations
- [ ] Add migration notes where applicable

#### 5.2 Module Configuration
**Effort:** 30 minutes

**Tasks:**
- [ ] Update `module.json` minimum Core Version to `13.0.0`
- [ ] Update version number
- [ ] Update changelog

#### 5.3 Final Documentation
**Effort:** 1 hour

**Tasks:**
- [ ] Update README with v13 compatibility
- [ ] Update migration document with lessons learned
- [ ] Create release notes

---

## Risk Assessment

### High Risk Areas
1. **Complex Applications** - `TokenImageReplacementWindow` and `BlacksmithWindowQuery` are very large and complex
   - **Mitigation:** Extra testing, phased rollout, thorough code review
   
2. **jQuery Event Handlers** - Event handling may have subtle differences
   - **Mitigation:** Comprehensive testing of all interactions

3. **Third-Party Module Compatibility** - Other modules may still use jQuery
   - **Mitigation:** Test with popular module combinations

### Medium Risk Areas
1. **ApplicationV2 Migration** - Learning curve for new API
   - **Mitigation:** Use official migration guide, start with simpler applications

2. **Dual Compatibility** - Supporting both v12 and v13 may add complexity
   - **Mitigation:** Consider v13-only migration for simpler codebase

### Low Risk Areas
1. **Simple jQuery Replacements** - Straightforward conversions
2. **Scene Controls Migration** - Well-documented change pattern

---

## Effort Estimates Summary

### By Phase
| Phase | Priority | Effort (Hours) | Timeline |
|-------|----------|----------------|----------|
| Phase 0: Lock Down v12 | 🔴 Critical | 1 | < 1 day |
| Phase 1: Critical Fixes | 🔴 Critical | 6-10 | 1-2 days |
| Phase 2: jQuery Removal | 🟡 High | 10-15 | 2-3 days |
| Phase 3: ApplicationV2 | 🟢 Medium | 12-20 | 4-6 days |
| Phase 4: Testing | 🔴 Critical | 4-6 | 1-2 days |
| Phase 5: Documentation | 🟢 Low | 2-3 | 1 day |
| **Total** | | **35-55** | **9-14 days** |

### By Priority
| Priority | Effort (Hours) | % of Total |
|----------|----------------|------------|
| Critical (Phases 1, 4) | 13-20 | 31-30% |
| High (Phase 2) | 12-18 | 29-27% |
| Medium (Phase 3) | 15-25 | 36-38% |
| Low (Phase 5) | 2-3 | 5-5% |

### Minimum Viable Migration (v13 Compatibility Only)
**Effort:** 20-30 hours (Phases 0, 1, 2, 4)  
**Timeline:** 4-7 days  
**Scope:** Lock v12, fix breaking changes, remove jQuery, test core functionality  
**Excludes:** ApplicationV2 migration (can be done later)  
**Note:** v13-only approach reduces effort by ~15% vs dual-compatibility

---

## Recommended Approach

### Option 1: Rapid v13 Compatibility (Recommended)
**Goal:** Get module working in v13 quickly  
**Effort:** 20-30 hours  
**Timeline:** 1-2 weeks

**Steps:**
1. Complete Phase 0 (Lock Down v12) - < 1 day
2. Complete Phase 1 (Critical Fixes) - 1-2 days
3. Complete Phase 2 (jQuery Removal) - 2-3 days
4. Complete Phase 4 (Testing) - 1-2 days
5. Release v13.0.0 (first v13-compatible version)
6. Migrate to ApplicationV2 in subsequent update (Phase 3)

**Pros:**
- Fastest path to v13 compatibility
- Reduces risk by separating concerns
- Allows user testing before major refactor

**Cons:**
- Applications still use older API
- May need second migration later

### Option 2: Full Migration
**Goal:** Complete migration including ApplicationV2  
**Effort:** 35-55 hours (reduced from 42-66)  
**Timeline:** 2-3 weeks

**Steps:**
1. Complete all phases sequentially
2. Release fully migrated version

**Pros:**
- Complete migration in one go
- Optimal performance from day one
- Future-proof codebase

**Cons:**
- Longer timeline
- Higher risk of issues
- Delayed v13 compatibility

### Option 3: Hybrid Approach
**Goal:** Critical fixes + selective ApplicationV2 migration  
**Effort:** 22-32 hours (reduced from 25-35)  
**Timeline:** 1.5-2 weeks

**Steps:**
1. Complete Phase 1 (Critical Fixes)
2. Complete Phase 2 (jQuery Removal)
3. Migrate only most-used Applications (2-3 classes)
4. Complete Phase 4 (Testing)
5. Release version
6. Migrate remaining Applications later

**Pros:**
- Balanced approach
- Prioritizes user-facing applications
- Reasonable timeline

**Cons:**
- Partial ApplicationV2 migration
- May need follow-up work

---

## Implementation Strategy

### Step-by-Step Process
1. **Complete Phase 0** - Lock down v12.1.22 release first
2. **Update module.json** - Set minimum Core Version to `13.0.0`
3. **Optional: Create Feature Branch** - `v13-migration` or `v13-dev` (recommended for safety, but optional for single developer)
4. **Start with Phase 1** - Fix critical errors first
5. **Test After Each Phase** - Don't proceed until phase is stable
6. **Use v13-Only Patterns** - No dual-compatibility needed (simpler code)
7. **Incremental Commits** - Commit after each file/module completion
8. **Regular Testing** - Test in v13 environment frequently
9. **When Ready** - Tag v13.0.0 and release

**Note:** Since v12 is locked and you're the only developer, you can work directly on `main` branch if preferred. A separate branch is optional but provides a safety net during development.

### Testing Strategy
1. **Development Testing** - Test in v13 development environment only
2. **Integration Testing** - Test with other v13-compatible modules
3. **User Testing** - Beta test with limited users on v13
4. **Production Testing** - Full production test before release
5. **No v12 Testing** - v12 is locked, no need to test backward compatibility

### Rollback Plan
1. **v12 Release Locked** - v12.1.22 is final v12 release (tagged and released)
2. **v13 Branch** - All v13 work in separate branch
3. **Document Changes** - All changes documented for reference
4. **Rollback Procedure** - Can revert to v12.1.22 if needed (but v13 is forward-only)

---

## Success Criteria

### Phase 0 Complete
- ✅ v12.1.22 tagged and released
- ✅ GitHub release created
- ✅ Documentation updated
- ✅ v12 support end date documented

### Phase 1 Complete
- ✅ No errors in v13 console
- ✅ Scene controls work correctly
- ✅ Combat tracker renders without errors
- ✅ Timers function correctly

### Phase 2 Complete
- ✅ All jQuery removed from codebase
- ✅ All UI interactions work correctly
- ✅ No performance regressions
- ✅ All windows and dialogs function

### Phase 3 Complete (Optional)
- ✅ All Applications migrated to ApplicationV2
- ✅ Performance improved or maintained
- ✅ All features work correctly
- ✅ Code follows v13 best practices

### Overall Success
- ✅ Module works in FoundryVTT v13
- ✅ No breaking changes for users
- ✅ All features functional
- ✅ Documentation updated
- ✅ Ready for production release

---

## Notes

- **Conservative Estimates:** All estimates are conservative and assume careful testing
- **Learning Curve:** First few files may take longer as patterns are established
- **Unexpected Issues:** Budget extra time (20%) for unexpected complications
- **Dual Compatibility:** If supporting both v12 and v13, add 10-15% to estimates
- **Code Review:** Include time for code review between phases

---

## Next Steps

1. **Complete Phase 0** - Lock down v12.1.22 release (tag, release, document)
2. **Review and Approve Plan** - Ensure alignment with project goals
3. **Set Timeline** - Choose migration approach and timeline
4. **Prepare Environment** - Set up v13 testing environment
5. **Update module.json** - Set minimum Core Version to `13.0.0`
6. **Optional: Create Branch** - Create `v13-migration` branch (optional, but provides safety net)
7. **Begin Phase 1** - Start with critical fixes
8. **Track Progress** - Use migration checklist to track completion

**Simplified Workflow (Single Developer):**
- Tag v12.1.22
- Update module.json to require v13
- Work directly on main branch
- Test frequently
- Tag v13.0.0 when ready

---

## v12 Lock-Down Checklist

### Pre-Lockdown
- [ ] Final testing of v12.1.22
- [ ] All v12 features working correctly
- [ ] No known critical bugs
- [ ] Documentation up to date

### Lockdown Steps
- [ ] Create git tag: `v12.1.22` (or `v12.1.22-final`)
- [ ] Create GitHub release for v12.1.22
- [ ] Mark release as "Final v12 Release"
- [ ] Update README.md with v12 support end notice
- [ ] Update CHANGELOG.md with v12.1.22 entry
- [ ] Create `v12-maintenance` branch (optional, for emergency fixes only)
- [ ] Document v12 support end date

### Post-Lockdown
- [ ] Update module.json for v13 development (minimum: "13.0.0")
- [ ] **Optional:** Create `v13-migration` or `v13-dev` branch (recommended for safety)
- [ ] Begin Phase 1 migration work on main (or branch if created)

---

## Questions to Consider

1. ~~**Dual Compatibility:** Do we need to support both v12 and v13 simultaneously?~~ **DECIDED: v13-only**
2. **ApplicationV2 Priority:** Is ApplicationV2 migration required for initial release?
3. **Timeline:** What is the target release date for v13 compatibility?
4. **Testing:** Who will be responsible for testing?
5. **Release Strategy:** Should we do a beta release first?
6. **v12 Support:** How long to maintain v12.1.22 for critical fixes? (Recommend: 30 days max)

---

*Last Updated: 2025-01-XX*
*Document Version: 1.0*

