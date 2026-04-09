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

## Request Roll Status

Request Rolls have now been separated from the generic Asset Mapping path.

- Request Roll presentation is driven by `themes/request-roll/theme-requestroll.json`
- the world setting is `requestRollThemeJson`
- the Request Roll runtime reads that theme JSON directly
- the active Request Roll theme shape uses `cinematicBanners` and `sounds`

Important boundary:

- this Request Roll theme file is Blacksmith-internal feature configuration
- it is not intended to be a shared external asset surface for sibling modules
- it should not be modeled as part of the general `BlacksmithConstants` / `AssetLookup` contract

Implication for the broader plan:

- Request Roll is now a concrete example of a feature-local theme bundle
- the older `assets-skillchecks.json` / `backgrounds` model should be treated as legacy naming, not the target direction for this feature

---

## Decision Log / Open Questions

These are the main decisions still open before implementation should proceed.

### 1. Canonical top-level taxonomy

What should the stable file/catalog shape be?

Still open:

- broader catalogs such as `assets-images.json`
- narrower catalogs such as separate application/card/illustration files

### 2. Classification of current uses

For each current asset/data use, we still need to decide whether it is:

- a library asset
- a semantic slot
- a feature theme concern
- internal-only asset/data

### 3. Core vs Vault boundary

We still need to define:

- what Blacksmith core ships as curated defaults
- what moves to `coffee-pub-vault`
- what remains internal/private and never becomes part of the public contract

### 4. Durable constants boundary

Working direction:

- durable compatibility constants likely remain only for curated core defaults / stable semantic behavior

Still open:

- exactly which constants survive
- which become shim-only
- which should disappear from the recommended external model

### 5. Public asset schema

We still need to lock the public schema for user-provided asset catalogs:

- required fields
- optional fields
- whether `value` remains
- whether `constantname` becomes internal-only
- whether `family`, `usage`, or both are formal schema fields

### 6. Feature theme schema

We still need a real schema for files like:

- `theme-requestroll.json`
- `theme-narrative-import.json`
- `theme-encounter-import.json`

Open points:

- how themes identify their feature
- how themes map slots
- whether themes can inherit from or extend other themes
- how modules register themes

### 7. Resolution order

We still need to define the official resolution stack.

Likely candidates:

- module-local override
- selected Vault asset/theme
- selected core asset/theme
- Blacksmith hard fallback

But this is not locked yet.

### 8. Settings storage model

We still need to decide what settings usually store:

- theme id
- slot-to-asset mapped id
- raw asset id
- raw path only for advanced/manual cases

### 9. External API target

We still need to define the future recommended external model for sibling modules:

- what remains on `BlacksmithConstants`
- what should move to registry/slot access
- what stays debug-only
- what becomes deprecated

### 10. First-class feature families

We still need to decide which feature areas deserve first-class treatment instead of remaining hardcoded or purely lookup-based.

Examples:

- Request a Roll
- narrative imports
- encounter imports
- combat start/end
- pin interactions

### 11. Meaning of `family`

The term is useful, but not yet formally defined.

Still open:

- is `family` library organization?
- is it feature grouping?
- how does it differ from `category`, `usage`, and slot namespace?

### 12. Migration strategy for sibling modules

Before implementation, we should know:

- what should continue working unchanged
- what will be shimmed
- what will require migration work in sibling modules
- what documentation/wiki changes must ship with the refactor

---

## External Migration Constraints

Any internal asset refactor has to respect the current external API story already published in:

- `documentation/api-core.md`
- the GitHub wiki page `API: Core Blacksmith`

Those docs currently teach downstream modules to rely on:

- `BlacksmithAPI` as the bridge import
- global objects such as `BlacksmithHookManager`, `BlacksmithUtils`, and `BlacksmithConstants`
- choice arrays exposed on `BlacksmithConstants`
- asset constants exposed through the Blacksmith global surface
- the idea that asset data currently has `id` / `value` / `path` separation

Because of that, internal cleanup cannot be planned as if Blacksmith were only consumed internally.

### Practical rule

We should lock a few internals before promising a migration path:

- canonical asset identity
- public schema expectations for user JSON
- semantic ids vs free library assets
- which catalogs are public vs internal
- what compatibility `BlacksmithConstants` continues to provide during the shim period

### Current external promises we should assume are in use

Until proven otherwise, assume external modules may depend on:

- `BlacksmithConstants.arrThemeChoices`
- `BlacksmithConstants.arrSoundChoices`
- `BlacksmithConstants.arrTableChoices`
- asset constants currently exposed via `BlacksmithConstants` or globals
- `BlacksmithAPI.waitForReady()` / `BlacksmithAPI.get()`
- early `module.api` availability in `ready`

### Migration requirement

For every internal asset/API change, we should classify external impact as one of:

- no external change
- externally compatible via shim
- externally deprecated with migration path
- external breaking change

Breaking changes should not happen by accident as a side effect of internal cleanup.

### Documentation requirement

When the internal design is settled, we will need to update both:

- local external docs
- GitHub wiki docs

They currently present a constants-heavy global object model. If the preferred future model becomes id-first registry access plus semantic slots, the docs will need a staged migration story rather than a silent drift.

---

## Current Usage Patterns

Before redesigning the internals, we should acknowledge how the current system is actually used today.

### 1. Settings and dropdown sourcing

Blacksmith is currently used as a shared source of dropdown choices for sibling modules.

Examples include:

- sounds
- tables
- macros
- compendiums
- images
- icons

This often happens through `BlacksmithConstants` choice arrays and selected-compendium arrays such as:

- `arrSelectedActorCompendiums`
- `arrSelectedMonsterCompendiums`
- `arrSelectedItemCompendiums`
- `arrThemeChoices`
- `arrSoundChoices`
- `arrTableChoices`
- `arrMacroChoices`

This is a real ecosystem use case, not just internal plumbing.

### 2. Constants as direct runtime references

Modules may directly reference constants in code for runtime behavior.

Examples:

- `SOUNDSPELLMAGICCIRCLE`
- `SOUNDNOTIFICATION01`
- `SOUNDBUTTON01`
- `BACKSKILLCHECK`

This means the current constants surface is not just a debug convenience. It is part of how sibling modules and runtime code reference sounds and images today.

### 3. Asset lookup as a search/filter tool

`AssetLookup` is currently positioned as a powerful query surface for assets.

Examples from the docs include:

- interface sounds tagged `error`
- monster banners
- monster banners tagged both `monster` and `flying`

That lookup capability is useful, but it is also more complex than many consumers likely need for ordinary settings or stable feature behavior.

### 4. Debug/introspection helper surfaces

The current external docs also present these helper commands:

- `BlacksmithAPIConstants()`
- `BlacksmithAPIGenerateConstants()`
- `BlacksmithAPIAssetLookup()`

These return large, overlapping objects and are useful for debugging, but they are not a clear long-term consumption model for external modules.

The presence of these commands is a sign that the underlying model is not yet simple enough to explain without tooling.

---

## Why The Current Model Feels Overlapped

The current system is trying to serve several different jobs at once:

- stable constants for existing modules
- dropdown choices for settings
- tag-based discovery and filtering
- full catalog introspection
- backward compatibility with older global patterns

Those are all valid needs, but they should not all be represented as equally primary API surfaces.

### What the sample output shows

The `documentation/object-sample.md` dump from `BlacksmithAPIGenerateConstants()` shows:

- grouped generated constants by asset family
- grouped generated choices by asset family
- a large amount of data duplication between ids, values, paths, and constant names

That output is useful for diagnostics, but it also highlights the design problem:

- one sound may exist as a constant name
- the same sound also exists as a path
- the same sound also exists as a choice entry
- the same sound also exists as a searchable tagged record

That is why the API currently feels powerful but overly complicated.

---

## Working Interpretation Of Those Use Cases

These use cases suggest Blacksmith needs different surfaces for different jobs.

### A. Stable settings surface

For module settings and serialized configuration, consumers want:

- simple dropdown choices
- stable ids
- predictable labels

They do not need full introspection dumps.

### B. Stable runtime reference surface

For runtime behavior, consumers want:

- a stable semantic reference
- a reliable way to resolve that reference

Today this is often done through constants. During migration, this likely becomes:

- semantic ids
- plus a compatibility constants shim

### C. Discovery/query surface

For richer features, consumers may want:

- tag queries
- category queries
- random selection
- broader filtering

This is where a lookup/query tool is still useful.

### D. Debug surface

Large object dumps are still fine for debugging, but they should be clearly documented as diagnostic helpers rather than as the preferred consumption model.

---

## Design Implication

The target is probably not “one API does everything.”

It is more likely:

- one canonical data model
- one stable settings/serialization model
- one stable runtime resolution model
- one optional query/discovery model
- one compatibility layer for old constants/globals
- one debug layer for inspection

That is much easier to document and much easier to migrate.

---

## Three-Layer Model To Evaluate

The current conversation suggests Blacksmith is mixing together two legitimate but different needs:

1. core module behavior needs stable internal references
2. users want to replace images and sounds for presentation/customization

A useful working model is to separate those concerns into three layers.

### Layer 1. Asset library

This is the pool of available assets.

Examples:

- sounds
- banners
- backgrounds
- illustrations
- icons

Characteristics:

- records are schema-defined
- users may extend or replace these catalogs where supported
- lookup/filtering happens here
- tags/categories/families/usages help discovery

This answers:

- what assets exist?
- what can the user choose from?

Note:

There may be both:

- global shared asset libraries
- feature-local theme asset libraries

### Layer 2. Semantic slots

These are stable behavioral roles Blacksmith features depend on.

Examples:

- combat-start sound
- combat-end sound
- request-roll cinematic illustration
- request-roll standard background
- application panel background
- critical success sound
- fumble sound

Characteristics:

- code depends on the slot identity
- slots should have stable ids
- slots should not depend on raw paths
- slots should not depend on user-defined constant names

This answers:

- what does the feature need?

### Layer 3. Slot-to-asset mappings

This is the layer that connects behavior to presentation.

Examples:

- `slot: request-roll.cinematic.background -> assetId: image-illustration-crypt-01`
- `slot: sound.combat.start -> assetId: sound-fanfare-intro-01`

Characteristics:

- settings should usually store the mapped asset id
- users can swap assets without changing feature logic
- code only resolves the slot, then resolves the mapped asset

This answers:

- which asset currently fulfills this role?

Those mappings may resolve either to:

- a global shared asset id
- or a theme-local asset reference, depending on the feature theme model

### Why this model matters

It resolves the collision between:

- stable core behavior
- user customization

without requiring:

- raw path dependencies in code
- user-defined constants
- giant undifferentiated lookup-only APIs

---

## Additional Layer: Feature Themes

The current discussion suggests that some features may need a higher-level abstraction than raw asset catalogs or individual slot mappings.

For those cases, a feature-specific theme JSON may be the right unit.

Examples:

- `themes/request-roll/theme-requestroll.json`
- `themes/narrative-import/theme-narrative-import.json`
- `themes/encounter-import/theme-encounter-import.json`

Current repo example:

- `themes/request-roll/theme-requestroll.json`
- `themes/request-roll/images/`
- `themes/request-roll/sounds/`

### What a feature theme is

A feature theme is a curated presentation bundle for one feature.

It should define a coherent set of slot mappings for that feature, such as:

- background image
- cinematic illustration
- success sound
- failure sound
- versus sound
- feature-specific icon or panel styling if needed later

A feature theme may:

- reference global shared assets
- include feature-local bundled images/sounds
- or mix both approaches

### What a feature theme is not

It is not:

- a raw asset catalog
- a replacement for the global image/sound/icon libraries
- the same thing as existing chat card themes

This distinction matters because Blacksmith already uses “theme” language for chat cards.

So internally and in docs we should distinguish:

- chat card themes
- feature themes

### Why feature themes may help

For many use cases, users do not want to configure six unrelated asset settings for one feature.

They want:

- “give Request a Roll this look and feel”
- “use this import presentation style for narratives”
- “use this encounter presentation pack”

That is a theme-level decision, not a raw asset-level decision.

### Likely relationship to the three-layer model

Feature themes would sit above the slot mapping layer as a curated preset mechanism:

- asset libraries provide raw candidate assets
- semantic slots define what the feature needs
- feature themes map a coherent set of those slots for one feature
- settings may choose a theme, then allow fine-tuning of individual slots if needed

### Theme bundle convention

The emerging filesystem convention is:

- `themes/<feature>/`

Within a feature folder, a theme bundle may include:

- one or more theme definition JSON files
- local `images/`
- local `sounds/`
- possibly other feature-local assets later

This means not every theme asset must be promoted into a global shared asset catalog.

### Global vs feature-local assets

This gives Blacksmith two valid asset scopes:

#### Global shared assets

Used across features/modules.

Examples:

- normalized core UI sounds
- shared icons
- shared application backgrounds
- cross-feature reusable visuals

#### Feature-local theme assets

Used primarily by a feature theme package.

Examples:

- `themes/request-roll/images/*`
- `themes/request-roll/sounds/*`

This should reduce pressure to force every presentation asset into one global taxonomy too early.

### Working direction

Use feature theme JSONs where:

- the feature has a recognizable presentation identity
- multiple coordinated asset slots belong together
- users benefit from selecting a pack/preset rather than hand-wiring every asset

Examples likely include:

- Request a Roll
- narrative imports
- encounter imports

Working implication:

- feature themes may either reference global asset ids or local theme-bundled assets
- the plan should not assume all presentation assets must live in shared global catalogs

---

## Classification Framework

Before deciding final files or schemas, each current asset/data use should be classified into one of three buckets:

- library asset
- semantic slot
- internal-only asset/data

### Bucket A. Library asset

Use this when the thing is primarily part of a user-facing pool of selectable assets.

Typical signs:

- multiple records of the same kind exist
- users may want to add their own alternatives
- tag/filter/search behavior is useful
- the feature does not care about one exact specific asset identity

Examples:

- general sound libraries
- illustration libraries
- banner libraries
- icon libraries

### Bucket B. Semantic slot

Use this when feature behavior depends on a stable role, even if the actual presentation asset may vary.

Typical signs:

- code means “the combat start sound”, not “some sound tagged fanfare”
- settings serialize a stable choice for a named feature behavior
- downstream modules need a predictable thing to configure or call
- users should be able to remap presentation without changing feature code

Examples:

- request-roll cinematic image
- combat start sound
- combat end sound
- critical roll sound
- app window background

Note:

A semantic slot may still be fulfilled through a selected feature theme rather than a manually assigned individual asset.

### Bucket C. Internal-only asset/data

Use this when the thing is implementation detail and should not yet be modeled as user-configurable or shared.

Typical signs:

- only one feature uses it
- there is no clear reuse case
- exposing it would complicate the public contract
- it exists only as a fallback or decorative internal detail

Examples:

- emergency fallback assets
- one-off internal UI assets
- implementation-specific defaults with no planned customization path

---

## Classification Checklist

Ask these questions for each current asset/data use.

### 1. Does code need a specific named role?

If yes, it is probably a semantic slot.

Examples:

- “play the combat start sound”
- “show the Request a Roll cinematic visual”

### 2. Is this mainly a pool of choices for users?

If yes, it is probably a library asset.

Examples:

- illustration choices
- sound library choices
- banner choices

### 3. Should users be able to swap this without changing behavior?

If yes, the behavior should likely use a semantic slot mapped to a library asset.

### 4. Is this only an internal implementation detail?

If yes, keep it internal-only unless a real public use case appears.

### 5. Would downstream modules need to reference this predictably?

If yes, avoid raw path dependency and prefer a semantic slot or documented asset id.

### 6. Is tag-based filtering sufficient, or does the feature need a guaranteed stable identity?

- filtering only: library asset
- guaranteed stable identity: semantic slot

---

## Applying This Model To The Current Problem

This model helps explain the current collision:

### Core module use

Core module features often need semantic slots.

Examples:

- application backgrounds
- specific UI/feature sounds
- standard icons for certain feature states

These should not rely on arbitrary user-provided constants.

### User-configurable assets

Users often want library assets and remappings.

Examples:

- custom cinematic illustrations for Request a Roll
- custom combat start/end sounds
- custom banners
- alternate visual flavor packs

These should be configurable without forcing the user to understand Blacksmith internals.

### Resulting design direction

The likely direction is:

- Blacksmith core uses semantic slots
- users choose or provide assets in library catalogs
- settings map slots to asset ids where customization is supported
- some internal assets remain Blacksmith-owned and are not remappable

For some features, the user-facing configuration may instead choose a feature theme first, with per-slot overrides as an optional advanced layer.

---

## Questions To Use During Inventory

For each current asset/data use, document:

- Is this a library asset, semantic slot, or internal-only?
- Is it used by Blacksmith core, external modules, users, or all three?
- Should users be able to replace it?
- Does the feature need a stable role or just a pool of choices?
- Is the current implementation storing a constant, an id, a path, or a value?
- What should the long-term stored form be?

This should guide the eventual file layout, schema design, and migration plan more than the current file names do.

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

### 1a. User JSON defines records, not code constants

For user-supplied JSON, the contract must be schema-based.

Blacksmith should not depend on:

- user-defined JS constant names
- ad hoc variable names
- undocumented field conventions

Instead, Blacksmith should depend only on documented schema fields.

For example, user-supplied sound catalogs should not define `constantname` as part of the public contract. If compatibility code still supports generated constants internally, that is a Blacksmith implementation detail, not a user authoring requirement.

### 1b. Tags are for filtering, not identity

Tags are useful for:

- browsing
- search
- fallback selection
- grouping

Tags should not be treated as the primary serialized identity of an asset.

If code must refer to a specific semantic slot, it should use a documented id or role, not “whatever asset has tag X”.

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

These catalogs may be one of two subtypes:

- library catalogs
- semantic catalogs

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

## Public Contract Model

This is the key design boundary for the next phase.

### 1. Library catalogs

These are user-extensible pools of assets.

Examples:

- a sound library
- a banner library
- an icon library

Behavior:

- users can define their own records
- Blacksmith reads documented schema fields only
- tags/categories support filtering and browsing
- code should not assume that arbitrary library records have special semantic meaning

Typical public fields:

- `id`
- `name`
- `path`
- `tags`
- optional `category`

### 2. Semantic catalogs

These are stable behavioral slots where code depends on a known identity.

Examples:

- a default UI button sound
- a standard notification error sound
- a specific contested-roll result visual
- a specific skill-check background role

Behavior:

- Blacksmith defines the stable ids or semantic roles
- users may remap what asset record fulfills that slot
- runtime code depends on the semantic id, not a constant name and not a raw path

This is the likely right model for serialized settings and stable feature behavior.

### 3. Internal-only assets/data

These remain Blacksmith-controlled.

Behavior:

- not part of the user JSON contract
- not exposed as public shared asset slots unless there is a clear reuse case
- may still be moved out of code and into internal JSON if that improves maintainability

---

## Schema Expectations

For any user-supplied catalog, the schema must be explicit and documented.

### Required rule

Blacksmith may only depend on documented fields in user JSON.

### Working direction for public asset records

Prefer a minimal, stable record shape:

- `id`: stable serialized identifier
- `name`: UI label
- `path`: asset file path
- `tags`: filtering metadata
- optional `category`: coarse grouping

### Fields that should not be part of the public user requirement

- `constantname`
- Blacksmith-specific generated globals
- implementation-only compatibility fields

If those exist, they should be treated as internal or transitional.

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
- user JSON should not be expected to provide them

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

For semantic behavior:

- store the semantic id or mapped asset id
- do not store legacy constant names
- do not depend on raw paths where a stable semantic slot exists

### Compatibility model

Legacy support may include:

- generated constant aliases
- `window.COFFEEPUB`
- `api.BLACKSMITH` compatibility keys

But those should be derived outputs, not the source of truth.

### Behavioral rule of thumb

If runtime code needs “a specific thing”, use a semantic id.

If runtime code needs “something matching these traits”, use a library catalog query with tags and filters.

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
- Explicit compatibility matrix for downstream modules

---

## Suggested Inventory Template

Use a table like this for each asset/data group.

| Group | Current Source | Current Key Shape | Current Consumers | Global or Feature-Specific? | User Remappable? | Target Home | Notes |
|------|----------------|-------------------|-------------------|-----------------------------|------------------|------------|------|
| Sounds | `assets-sounds.json` | `id` + `value` + `path` + `constantname` | settings, runtime sound playback | Global | Yes | Shared asset catalog | Normalize stored value to `id` |
| Nameplates | `config-nameplates.json` | `id` + `value` + `constantname` | token naming settings | Shared config | Maybe | Shared config catalog | Naming mismatch today |
| MVP templates | `narratives-stats-mvp.json` | structured object | stats/narrative systems | Feature-specific shared data | No | Feature data catalog | Not really an asset catalog |

---

## First-Pass Inventory (Current Repo)

This is the current-state inventory from the repo as of this document update. It is intentionally practical rather than final.

### A. Current mapped JSON catalogs

| Current File | Current Key | Count | Current Role | Current Classification | Main Consumers | Notes |
|------|------|------|------|------|------|------|
| `resources/asset-defaults/assets-sounds.json` | `sounds` | 131 | Shared sound catalog | Mixed: library asset + semantic slot source | settings dropdowns, constants, `AssetLookup`, direct runtime sound refs | Very broad; likely too inclusive without stronger internal structure |
| `resources/asset-defaults/assets-banners.json` | `banners` | 16 | Shared banner/image catalog | Mixed: library asset + semantic slot source | settings, `AssetLookup`, constants | Does not cover all banner-like image usage |
| `resources/asset-defaults/assets-icons.json` | `icons` | 9 | Shared icon catalog | Library asset | settings, constants | Currently Font Awesome oriented |
| `resources/asset-defaults/assets-background-cards.json` | `images` | 12 | Card/tile background images | Likely library asset | settings, constants | Name is already overloaded with tiles/backgrounds |
| `resources/asset-defaults/assets-skillchecks.json` | `backgrounds` | 6 | Legacy skill-check cinematic backgrounds | Legacy semantic slot source | legacy constants, older Request Roll path | Superseded in active Request Roll flow by `themes/request-roll/theme-requestroll.json` with `cinematicBanners` |
| `resources/config-nameplates.json` | `names` | 11 | Nameplate presets | Shared config catalog | settings, constants | Not an asset catalog in the same sense as images/sounds |
| `resources/config-volumes.json` | `volumes` | 4 | Volume presets | Shared config catalog | runtime sound playback, constants | Also not an asset catalog in the same sense |
| `resources/narratives-stats-mvp.json` | structured object | n/a | Narrative text/templates | Feature data catalog | stats/narrative systems | Not an asset catalog |

### B. Current sound catalog shape

The current sound catalog is broad and already contains several distinct families under one file.

Current `category` counts in `assets-sounds.json`:

- `effects`: 55
- `interface`: 43
- `reaction`: 19
- `soundtrack`: 5
- `instrument`: 4
- `weapon`: 3
- `magic`: 1
- `one-shots`: 1

Common tags also show mixed semantic intent:

- `interface`
- `notification`
- `button`
- `error`
- `movement`
- `object`
- `fanfare`
- `combat`

Interpretation:

- one file is workable
- but “sounds” is currently doing several jobs at once
- the file likely needs stronger internal structure even if it remains a single file

### C. Shipped image families not currently mapped through the asset catalogs

These exist in the repo but are not currently represented as first-class mapped JSON catalogs.

| Path | Count | Likely Role | Initial Classification |
|------|------|------|------|
| `images/backgrounds` | 9 | Application/panel backgrounds | likely library asset or semantic slot source |
| `images/overlays` | 4 | Decorative overlays | internal-only or future library asset |
| `images/markers` | 12 | Marker assets | likely feature/library decision pending |
| `images/pins-map` | 80 | Map pin art | likely feature-specific library asset |
| `images/pins-note` | 53 | Note/pin icons and shapes | likely feature-specific library asset |
| `images/portraits` | 23 | Fallback portrait + blood overlays | mixed internal-only + semantic slot source |
| `images/tiles` | 19 | Tile/background textures | likely library asset |
| `images/tokens/death` | 57 | Death-state token art | feature-specific asset family |
| `images/tokens/loot` | 14 | Loot token art | feature-specific asset family |

This confirms that a large amount of shipped visual content is outside the current mapped asset system.

### D. Current settings/cache surfaces adjacent to the asset system

These are not asset catalogs, but they are part of the current “shared choices and shared data” story:

- `arrThemeChoices`
- `arrSoundChoices`
- `arrTableChoices`
- `arrMacroChoices`
- `arrSelectedActorCompendiums`
- `arrSelectedMonsterCompendiums`
- `arrSelectedItemCompendiums`
- other `arrSelected[Type]Compendiums`

These matter because external modules are already consuming them as Blacksmith-owned shared configuration surfaces.

### E. Current hardcoded literals bypassing catalogs

These should be treated as part of the inventory because they represent real asset/config usage not yet modeled cleanly.

Known examples:

- curated narrative card image selector in settings
- curated encounter card image selector in settings
- contested/group-roll result banner paths
- journal pin default sounds
- portrait/token fallback paths

Request Roll note:

- Request Roll contested/group-roll banners and Request Roll-specific sounds have now been moved into the feature-local `themes/request-roll/theme-requestroll.json`
- those entries should now be treated as part of the Request Roll theme bundle, not as generic shared asset-mapping data

Representative code locations:

- `scripts/settings.js` `narrativeDefaultCardImage`
- `scripts/settings.js` `encounterDefaultCardImage`
- `scripts/manager-rolls.js` contested/group-roll result banners
- `scripts/ui-journal-pins.js` default sound paths
- `scripts/window-skillcheck.js` skill-check background fallback paths

### F. Current consumption surfaces

The current inventory only makes sense if we also name how the data is consumed.

#### 1. Choice/cache consumers

Used for settings and sibling-module dropdowns:

- `BlacksmithConstants.arrSoundChoices`
- `BlacksmithConstants.arrThemeChoices`
- `BlacksmithConstants.arrTableChoices`
- selected compendium arrays

#### 2. Constant consumers

Used for direct runtime references:

- `window.COFFEEPUB?.SOUNDBUTTON04`
- `window.COFFEEPUB?.SOUNDNOTIFICATION09`
- `window.COFFEEPUB?.SOUNDVOLUMENORMAL`
- `BACKSKILLCHECK`
- `BACKCONTESTEDROLL`

#### 3. Query/lookup consumers

Used for search/filter behavior:

- `assetLookup.getByTypeAndTags(...)`
- `assetLookup.getByCategory(...)`
- `assetLookup.searchByCriteria(...)`
- `assetLookup.getRandom(...)`

#### 4. Debug/introspection consumers

Used mostly for inspection rather than normal feature consumption:

- `BlacksmithAPIConstants()`
- `BlacksmithAPIGenerateConstants()`
- `BlacksmithAPIAssetLookup()`

### G. Inventory takeaways

The inventory currently suggests:

- the existing JSON split solved packaging and override loading, but not the conceptual model
- sounds are probably still one file, but they need better internal structure
- images are more fragmented than the current catalogs imply
- several important feature visuals/sounds are still modeled as hardcoded literals instead of library assets, semantic slots, or internal-only assets
- Blacksmith’s shared config caches and shared asset surfaces are currently intermixed in external docs and usage
- some feature areas will likely want feature theme JSONs rather than exposing every slot as a first-class setting immediately

This first-pass inventory should be refined rather than treated as final taxonomy.

---

## Optional Module Layer: Vault

Another working direction from the current discussion:

- `coffee-pub-blacksmith` should ship a greatly simplified, policy-safe curated core
- `coffee-pub-vault` should be an optional module that registers richer asset libraries and feature themes

### Working role of Blacksmith core

Core should provide:

- normalized shared core sounds/icons/backgrounds where needed across Coffee Pub modules
- durable compatibility constants for curated core behavior where necessary
- stable semantic slots
- the registry and resolution model
- one or more safe default feature themes

### Working role of Vault

Vault should provide:

- more extensive optional asset libraries
- richer feature theme packs
- optional visual/audio flavor expansions

Vault may reasonably contribute:

- global shared assets
- feature theme bundles under feature-specific theme folders

Vault should extend the available assets and themes without redefining the core API contract.

### Working role of sibling modules

Sibling modules should be able to:

- use Blacksmith core defaults
- opt into Vault-provided assets/themes when available
- provide module-local defaults or overrides where appropriate

---

## Open Topics For Later Conversation

These are intentionally not resolved in this document.

- Final taxonomy for the many “background” variants
- Whether panels should be first-class shared assets
- Whether tiles should be globally mapped
- Whether curated narrative/encounter card image lists are shared assets or feature data
- How long the legacy constants shim remains supported
- Whether some shipped art moves to a companion pack instead of core
- Which current systems should use semantic ids vs free library selection
- Exact external migration guidance for Coffee Pub sibling modules
- Where feature themes should be first-class and where simple slot mappings are enough

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
