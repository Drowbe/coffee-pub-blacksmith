# Asset Inventory, Taxonomy, and API Migration Plan

## Purpose

This document replaces the earlier “split JSON / Asset Mapping” implementation plan with the next-stage plan: clean up the asset model itself.

The JSON split is already in place. The remaining problem is that Blacksmith still has too many overlapping ways to describe and consume assets:

- JSON catalogs
- `AssetLookup`
- generated global constants
- `BLACKSMITH` choice caches
- hardcoded paths in runtime code
- settings that sometimes store ids, sometimes values, sometimes raw paths, and sometimes legacy constant names

That variability is now the main source of confusion.

This plan is for:

- reducing API variability
- normalizing names
- making JSON ownership clear
- removing redundant constants
- moving hardcoded asset/config literals into JSON where it makes sense
- preparing for core-safe, non-AI-shipped defaults

No code changes are implied by this document by itself.

---

## Current State

### What is already done

| Area | Status | Notes |
|------|--------|-------|
| Split shipped defaults into JSON | Done | `resources/asset-defaults/*.json` |
| Runtime fetch loader | Done | `scripts/asset-loader.js` |
| Asset Mapping settings | Done | Per-category JSON path overrides for current mapped categories |
| Deferred `AssetLookup` init | Done | Built in `ready` after JSON load |

### What is still messy

| Problem | Notes |
|---------|-------|
| Multiple asset identities | Some code uses `id`, some uses `value`, some uses `path`, some uses `constantname` |
| Multiple constant surfaces | `window.COFFEEPUB`, global constants, `api.BLACKSMITH`, `ConstantsGenerator` |
| Mixed storage in settings | Some settings store constant names, some store path-like values, some store raw paths |
| Taxonomy drift | “backgrounds” means different things in different places |
| Unmapped assets | Many shipped images/sounds are not represented in JSON catalogs |
| Hardcoded asset literals remain | Paths and curated asset lists still live in code |
| Naming drift | Example: `arrNameChoices` vs `arrNameplateChoices` |

---

## Decisions Captured So Far

These are working assumptions for the migration:

| Topic | Direction |
|------|-----------|
| Legacy global constants | Keep as a temporary compatibility shim, not as the long-term model |
| User-facing settings storage | Prefer canonical `id` |
| Narrative / encounter card images | Larger taxonomy discussion; do not lock final category design yet |
| Next step | Start with inventory, then define target taxonomy, then migrate surfaces to that target |

---

## Core Migration Principles

### 1. One canonical identity per asset

Every mapped asset should have one canonical identity for storage and API references.

**Target:** store and pass `id`.

Use other fields for specific purposes only:

- `id`: canonical identifier for settings and API references
- `label` or `name`: user-facing display
- `path`: resolved file path when the asset is file-backed
- `value`: only if a category truly needs a semantic value separate from `id`
- `constantname`: legacy compatibility alias only

If a category does not need both `id` and `value`, it should not have both just because other categories do.

### 2. One runtime asset registry

Long-term, Blacksmith should have one primary runtime asset surface.

Conceptually:

- registry owns the catalogs
- settings store ids
- runtime resolves ids to paths/metadata
- legacy constants are derived from the registry, not treated as primary data

### 3. JSON should own data, code should own behavior

Things that belong in JSON:

- asset records
- preset lists
- curated selector lists
- labels/tags/categories
- non-code defaults that users may want to replace

Things that belong in code:

- lookup behavior
- validation
- resolution rules
- fallback behavior
- migration shims

### 4. Compatibility is a layer, not the model

Legacy constants and old `COFFEEPUB` patterns should be treated as adapters around the new catalog model, not as first-class design constraints.

---

## Inventory Work

Before final taxonomy changes, we need a real inventory of what Blacksmith currently ships and how each thing is used.

### Inventory buckets

We should inventory at least these categories:

- Sounds
- Banners
- Skill-check backgrounds
- Card backgrounds
- Tiles
- Panels
- Portrait overlays
- Token overlays
- Token defaults
- Pin icons
- Font Awesome icons
- Non-Font-Awesome icons
- Nameplate presets
- Volume presets
- Narrative templates / MVP text
- Other shipped art not currently mapped

### For each asset/data group, capture

- Current file source
- Current JSON source, if any
- Current runtime consumer(s)
- Current settings consumer(s)
- Whether it is user-remappable
- Whether it is a global/shared asset or feature-specific data
- Whether it should remain in core
- Whether it includes assets likely to be removed or simplified for policy/licensing reasons

### Inventory outputs

The inventory should produce three lists:

1. Global unified assets  
   These belong in the shared asset registry and may be consumed by multiple systems.

2. Feature-specific assets/data  
   These belong to a feature catalog or module-local config, not the global registry.

3. Unmapped shipped assets  
   These need an explicit decision:
   map them, move them, or treat them as internal/private assets.

---

## Working Taxonomy Direction

This is not final, but it is the direction to test the inventory against.

### A. Shared asset catalogs

These are globally useful, user-remappable, and should use the canonical asset model.

Examples:

- sounds
- banners
- icons
- card-backgrounds
- skillcheck-backgrounds
- maybe tiles
- maybe panels

### B. Shared config catalogs

These are structured presets, but not “assets” in the same sense as images/sounds.

Examples:

- nameplates
- volumes
- maybe animation presets later

### C. Feature data catalogs

These are structured data sets tied to a subsystem rather than a general asset class.

Examples:

- narrative MVP templates
- curated narrative card image selectors
- curated encounter card image selectors
- contested-roll result visuals
- journal pin default behaviors

### D. Private/internal assets

These are implementation details that should not be exposed as shared global assets unless there is a real reuse case.

Examples may include:

- internal UI fallbacks
- hardcoded emergency fallback images
- one-off decorative assets for a specific feature

---

## Naming Rules To Adopt

### File and catalog naming

Use names that describe intent, not historical implementation.

Prefer:

- `assets-sounds.json`
- `assets-banners.json`
- `assets-icons.json`
- `assets-card-backgrounds.json`
- `config-nameplates.json`
- `config-volumes.json`
- `data-narratives-mvp.json`

Avoid overloaded names like:

- `backgrounds`
- `images`
- `dataBackgroundImages`
- `dataBackgrounds`

unless the narrower meaning is explicitly documented.

### Runtime collection naming

Prefer singular taxonomy roots with predictable plural collections:

- `sounds`
- `banners`
- `icons`
- `cardBackgrounds`
- `skillcheckBackgrounds`
- `nameplates`
- `volumes`

Avoid mixed legacy naming like:

- `dataBackgroundImages`
- `dataBackgrounds`
- `arrNameChoices`
- `arrNameplateChoices`

### Constant naming

Legacy constants may remain temporarily, but new design should not depend on inventing more of them.

If constants remain during migration:

- constants should map to ids or resolved values consistently
- constants should be generated from the registry
- constants should be documented as compatibility aliases

---

## Known Problem Areas To Fold Into JSON

These should be explicitly reviewed during migration.

### 1. Settings with hardcoded curated asset choices

Current narrative and encounter default card image settings contain inline path maps in code. These should move into JSON-backed curated catalogs or selectors.

### 2. Runtime hardcoded image/sound literals

Examples include:

- contested/group-roll result banners
- journal pin default sounds
- other feature-specific fallback assets

Each should be reviewed and either:

- moved into a shared catalog
- moved into feature data JSON
- kept as a true private fallback

### 3. Sound settings storing legacy constant names

At least some sound settings still default to constant names while the dropdown choices are built from path-like values. This must be normalized.

### 4. Duplicate / parallel constant generation paths

Today we have:

- `AssetLookup` generating constants
- `ConstantsGenerator`
- `BLACKSMITH` caches
- `COFFEEPUB` sync hooks

This should become one primary path plus temporary shims.

---

## Target API Direction

This section is conceptual. Exact names can change later.

### Canonical external behavior

The public system should make these questions easy:

- list available assets in a catalog
- get metadata for an asset id
- get UI choices for a catalog
- resolve an asset id to a path/value
- ask whether an id still exists after remapping

### Canonical storage model

Settings should store:

- asset `id` for shared asset references
- raw path only when the user is intentionally choosing an arbitrary custom path outside the catalog system

### Compatibility model

Legacy support may include:

- generated constant aliases
- `window.COFFEEPUB`
- `api.BLACKSMITH` compatibility keys

But those should be derived outputs, not the source of truth.

---

## Proposed Phases

| Phase | Goal | Status | Notes |
|------|------|--------|-------|
| 1 | Inventory all shipped assets/data and their consumers | Planned | Build the current-state map first |
| 2 | Define target taxonomy and naming rules | Planned | Decide what is global, feature-specific, or private |
| 3 | Define canonical schema and identity rules | Planned | `id`-first, with clear meaning for `path`, `value`, `constantname` |
| 4 | Normalize settings storage model | Planned | Prefer stored ids; document exceptions |
| 5 | Reduce constant/API duplication | Planned | Make registry primary; keep constants as shim |
| 6 | Move appropriate hardcoded literals into JSON | Planned | Curated selectors, contest banners, pin defaults, similar |
| 7 | Remove or quarantine non-core / AI-problematic shipped art | Planned | Based on taxonomy and inventory |
| 8 | Update docs and migration notes | Planned | Internal + external API documentation |

---

## Concrete Deliverables

### Phase 1 deliverables

- Asset inventory table
- Consumer map
- Settings map
- Hardcoded-literal audit

### Phase 2 deliverables

- Approved taxonomy
- Approved collection names
- Approved JSON file naming pattern
- Approved “global vs feature-local” rules

### Phase 3 deliverables

- Canonical asset schema
- Compatibility schema rules
- Migration rules for old settings values

### Phase 4+ deliverables

- Implementation plan per subsystem
- Changelog and migration notes
- External API documentation updates

---

## Suggested Inventory Template

Use a table like this for each asset/data group.

| Group | Current Source | Current Key Shape | Current Consumers | Global or Feature-Specific? | User Remappable? | Target Home | Notes |
|------|----------------|-------------------|-------------------|-----------------------------|------------------|------------|------|
| Sounds | `assets-sounds.json` | `id` + `value` + `path` + `constantname` | settings, runtime sound playback | Global | Yes | Shared asset catalog | Normalize stored value to `id` |
| Nameplates | `config-nameplates.json` | `id` + `value` + `constantname` | token naming settings | Shared config | Maybe | Shared config catalog | Naming mismatch today |
| MVP templates | `narratives-stats-mvp.json` | structured object | stats/narrative systems | Feature-specific shared data | No | Feature data catalog | Not really an asset catalog |

---

## Open Topics For Later Conversation

These are intentionally not resolved in this document.

- Final taxonomy for the many “background” variants
- Whether panels should be first-class shared assets
- Whether tiles should be globally mapped
- Whether curated narrative/encounter card image lists are shared assets or feature data
- How long the legacy constants shim remains supported
- Whether some shipped art moves to a companion pack instead of core

---

## Related Files

- `resources/asset-defaults/*.json`
- `resources/config-volumes.json`
- `resources/config-nameplates.json`
- `resources/narratives-stats-mvp.json`
- `scripts/asset-loader.js`
- `scripts/asset-lookup.js`
- `scripts/constants-generator.js`
- `scripts/settings.js`
- `scripts/blacksmith.js`

---

## Immediate Next Step

Do the inventory.

Before renaming files, changing schemas, or collapsing APIs, we should document:

- what assets/data exist now
- who consumes them
- which ones are truly global
- which ones should move to feature-level catalogs
- which ones are currently bypassing the catalogs entirely

That inventory should become the basis for the actual implementation plan and task breakdown.
