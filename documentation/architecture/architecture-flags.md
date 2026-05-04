# Flags System Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes how the Flags system is built and how its parts interact. It is an architecture reference, not an API reference (see `api-flags.md` for the public API).

## Overview

The Flags system is a module-agnostic labeling infrastructure. Any coffee-pub module can define a **taxonomy** of recommended flags for a data type, attach flags to its records via Blacksmith's central store, and rely on Blacksmith to manage the world-level registry, normalization, rename/delete, per-user visibility, and the UI widget.

"Flag" in this system means a normalized classification label (e.g., `"tavern"`, `"main-quest"`, `"todo"`). This is distinct from FoundryVTT's `document.flags` API, which is a generic key-value store on documents.

**Target:** FoundryVTT v13+.

**Relationship to Pins:** The Pins tag system (currently in `manager-pins.js` and `api-pins.js`) is the v0 implementation that this system generalizes. On extraction, Pins becomes a consumer of the Flags API. All existing pin tag data migrates to the central assignment store; the compatibility shim handles this on first load (see Migration section).

---

## Core Concepts

| Concept | Description |
|---|---|
| **Flag** | A normalized string label: lowercase, hyphen-separated, no spaces. E.g., `"main-quest"`. |
| **Context key** | Scopes a taxonomy and assignment store to one module + data type. Format: `{moduleId}.{dataType}`. E.g., `"coffee-pub-blacksmith.journal-pin"`, `"coffee-pub-squire.quests"`. |
| **Taxonomy** | A predefined set of recommended flags for a given context key. Defined in `flag-taxonomy.json`. |
| **Global flags** | Flags that apply across all contexts (e.g., `"todo"`, `"revisit"`). Suggested in every context's choices. |
| **Protected flag** | A taxonomy flag that drives code behavior in a module (e.g., a pin type value). Cannot be renamed or deleted by the GM via the UI. Marked `protected: true` in the taxonomy JSON. |
| **Registry** | The world-level list of all known flags. Grows on first use; shrinks on delete. |
| **Custom flag** | Freeform flag created by a user, not present in any taxonomy. |
| **Orphan flag** | In the registry but not used by any record and not in any taxonomy. Safe to prune. |

### Four-tier flag classification

Every flag in the registry falls into one tier:

1. **Protected** — in the taxonomy with `protected: true`. Drives module code. Shown as "Built-in" in UI. Cannot be renamed or deleted by GM via the UI.
2. **Taxonomy** — in the taxonomy without the protected marker. Shown as "Suggested" in UI. Protected from bulk delete but GM can remove individually.
3. **Custom** — user-created, not in any taxonomy. Shown as "Custom" in UI. Can be deleted by GM.
4. **Orphan** — in the registry but no records use it and it is not in any taxonomy. Shown as "Orphan" in UI. Can be pruned automatically or by GM.

---

## Storage

All flag data is owned and managed by Blacksmith. Consuming modules do not store flags in their own record data; they read and write flags via the FlagsAPI.

### Flag assignments (central store)

- **Where:** World setting `flagAssignments` (object, GM-writable via proxy for non-GM users).
- **Shape:**
  ```json
  {
    "coffee-pub-blacksmith.journal-pin": {
      "pin-abc123": ["narrative", "backstory"],
      "pin-def456": ["encounter", "tavern"]
    },
    "coffee-pub-squire.quests": {
      "quest-xyz789": ["main", "faction"]
    }
  }
  ```
- **Key structure:** `flagAssignments[contextKey][recordId]` = `string[]` (normalized flags).
- **Why central:** FlagManager can execute rename and delete entirely within this one store — no cross-module coordination required. Any context key that registered a taxonomy or has records with flags is represented here.

### World registry

- **Where:** World setting `flagRegistry` (array of normalized flag strings, GM-writable).
- **When:** Grows on first use of any new flag; shrinks on `delete()`.
- **Scope:** One registry for the whole world, shared across all contexts.

### Visibility

- **Where:** Client setting `flagVisibility` (object, per-user).
- **Shape:** Two lookup patterns coexist:
  - `flagVisibility[flag]` — global default visibility for a flag across all contexts.
  - `flagVisibility[contextKey + "." + flag]` — context-specific override. Takes precedence over the global default when present.
- **Resolution order:** Context override → global default → `true` (visible by default if no entry exists).
- **Scope:** Client only. Affects UI filtering only; does not remove flags from stored data.

### Taxonomy (static)

- **Where:** `resources/flag-taxonomy.json` (shipped with Blacksmith). Contains all context entries across all coffee-pub modules.
- **Override:** Optional override JSON at the path stored in world setting `flagTaxonomyOverrideJson`. Override entries are merged on top of the built-in JSON (override wins on collision).
- **Runtime registration:** Modules may also call `flags.register(contextKey, taxonomy)` during `blacksmithReady` as a convenience, but the JSON file is the canonical source. Runtime entries merge on top of override entries (runtime wins on collision). This path is mainly for dynamic or dev-time use.

---

## Components

### FlagManager (`scripts/manager-flags.js`)

Core logic. No UI, no module-specific knowledge.

**Responsibilities:**
- Load and merge taxonomy from JSON, override JSON, and runtime registrations.
- Normalize flag arrays: deduplicate, lowercase, replace spaces with hyphens.
- CRUD on the world registry: add, rename, delete.
- Read and write the central `flagAssignments` store: `setFlags`, `getFlags`, `deleteRecordFlags`.
- On `rename(old, new)`: update every `flagAssignments[contextKey][recordId]` array across all contexts, then update the registry.
- On `delete(flag)`: remove from every assignment array across all contexts, then remove from the registry. Protected flags are rejected.
- Classify flags into protected / taxonomy / custom / orphan tiers.
- Manage per-user visibility state (global and context-level).
- Seed the registry from existing data on first run.

**Key internal methods:**

| Method | Purpose |
|---|---|
| `_loadTaxonomy()` | Parse `flag-taxonomy.json` + override; store in `_builtinTaxonomy`. |
| `_getRuntimeTaxonomy()` | Return the in-memory runtime registry (populated by `register()`). |
| `_mergeTaxonomy(contextKey)` | Merge built-in, override, and runtime entries for one context. |
| `_normalize(flags[])` | Returns deduplicated, lowercased, hyphenated array. |
| `_getAssignments()` | Read world setting `flagAssignments`. |
| `_writeAssignments(data)` | Write world setting (GM-only path; non-GM uses requestGM). |
| `_getRegistry()` | Read world setting `flagRegistry`. |
| `_writeRegistry(flags[])` | Write world setting (GM-only path). |
| `_isProtected(flag)` | Return true if `flag` appears as `protected: true` in any taxonomy entry. |
| `_resolveVisibility(flag, contextKey?)` | Apply context override → global default → true fallback. |

### FlagsAPI (`scripts/api-flags.js`)

Public interface. Thin wrapper over FlagManager. Consumed via `game.modules.get('coffee-pub-blacksmith')?.api?.flags`.

See `api-flags.md` for full method contracts. High-level surface:

**Taxonomy**
- `register(contextKey, taxonomy)` — merge a taxonomy at runtime (convenience; JSON is canonical).
- `getChoices(contextKey)` — get suggested flags (taxonomy + globals) for a UI picker.

**Record flag CRUD**
- `setFlags(contextKey, recordId, flags[])` — replace the flags for one record. Normalizes and updates registry.
- `getFlags(contextKey, recordId)` — get the current flags for one record.
- `addFlags(contextKey, recordId, flags[])` — add flags to a record without replacing existing ones.
- `removeFlags(contextKey, recordId, flags[])` — remove specific flags from a record.
- `deleteRecordFlags(contextKey, recordId)` — remove all flag data for a record (e.g. on record delete).

**Registry management (GM only)**
- `getRegistry()` — get the full world flag list.
- `normalize(flags[])` — normalize a flag array.
- `rename(oldFlag, newFlag)` — rename globally: updates all assignments across all contexts and the registry.
- `delete(flag)` — remove from registry and strip from all assignments across all contexts. Rejected for protected flags.
- `seedRegistry(contextKey, existingFlags[])` — one-time call to populate registry from a flat list.

**Visibility**
- `setVisibility(flag, visible, contextKey?)` — set global visibility, or a context-specific override if `contextKey` is provided.
- `getVisibility(flag, contextKey?)` — read effective visibility (applies context override → global → default true).

### Taxonomy JSON (`resources/flag-taxonomy.json`)

Single source of truth for all taxonomy entries across all coffee-pub modules. Format:

```json
{
  "version": 1,
  "globalFlags": ["todo", "revisit", "avoid", "complete"],
  "contexts": {
    "coffee-pub-blacksmith.journal-pin": {
      "label": "Journal Page",
      "flags": [
        { "key": "narrative" },
        { "key": "backstory" },
        { "key": "encounter" },
        { "key": "tavern" },
        { "key": "location", "protected": true }
      ]
    },
    "coffee-pub-squire.quests": {
      "label": "Quests",
      "flags": [
        { "key": "main", "protected": true },
        { "key": "side", "protected": true },
        { "key": "backstory" },
        { "key": "faction" }
      ]
    }
  }
}
```

`protected: true` marks flags that the owning module's code depends on. FlagManager rejects rename or delete attempts on protected flags. When a module's code checks `flags.includes('main')` to determine behavior, that flag must be marked protected.

`pin-taxonomy.json` remains in place during the migration window and is read by the compatibility shim in FlagManager (see Migration section).

### FlagWidget (`scripts/widget-flags.js`)

A reusable UI component for selecting and managing flags. Consumed by any module that needs a flags interface — it does not need to re-implement tag input, chip rendering, or search.

**Prerequisite:** The Blacksmith Window API (`documentation/api/api-window.md`). FlagWidget is designed to be embedded inside Application V2 windows and follows the same lifecycle and CSS conventions.

**Capabilities:**
- Display current flags as removable chips.
- Input field with live search/filter against taxonomy choices.
- Add new flags (custom or from suggestions) via keyboard or click.
- Remove individual flags.
- Show taxonomy suggestions grouped by tier (protected / taxonomy / custom).
- Optional filter-only mode (for filtering panels — no add/remove, only show/hide toggles).
- Emits a change event when the flag set changes; consuming window reads it on save.

**Usage (inside an Application V2 window):**

```javascript
// In prepareContext():
context.flagWidget = FlagWidget.prepareData(contextKey, currentFlags);

// In template (HBS):
{{> blacksmith-flag-widget flags=flagWidget}}

// In changeHandler or _onSubmit():
const newFlags = FlagWidget.readValue(this.element, contextKey);
await game.modules.get('coffee-pub-blacksmith').api.flags.setFlags(contextKey, recordId, newFlags);
```

**Files:** `scripts/widget-flags.js`, `templates/widget-flags.hbs`, `styles/widget-flags.css`.

---

## Data flow

### Flag normalization

```
raw input (user text or API call)
  → split on comma/space
  → trim whitespace
  → lowercase
  → replace remaining spaces with hyphens
  → deduplicate
  → normalized string[]
```

### Taxonomy resolution for a context key

```
1. Load built-in JSON entries for contextKey
2. Merge override JSON entries (override wins on collision)
3. Merge runtime-registered entries (runtime wins on collision)
4. Append globalFlags
→ return merged flag list as "choices" (used by getChoices and FlagWidget)
```

### Visibility resolution for a flag

```
1. Check flagVisibility[contextKey + "." + flag]  → context override (highest priority)
2. Check flagVisibility[flag]                      → global default
3. Default: true (visible)
```

### Delete / rename write path

Both operations are GM-only and touch the central assignment store:

```
rename(old, new):
  1. Reject if old is protected
  2. For each contextKey in flagAssignments:
       For each recordId: replace old with new in flags[]
  3. Replace old with new in flagRegistry
  4. Write flagAssignments + flagRegistry (GM proxy if needed)

delete(flag):
  1. Reject if flag is protected
  2. For each contextKey in flagAssignments:
       For each recordId: remove flag from flags[]
  3. Remove flag from flagRegistry
  4. Write flagAssignments + flagRegistry (GM proxy if needed)
```

### Registry write path (all mutations)

Non-GM users cannot write world settings directly. Any registry or assignment mutation goes through the GM proxy via `requestGM` / socket, same pattern as pin CRUD. FlagManager detects GM status and routes accordingly.

---

## Permission model

| Operation | Player | GM |
|---|---|---|
| Read registry | Yes | Yes |
| Read taxonomy | Yes | Yes |
| Read flags for a record | Yes (via FlagsAPI) | Yes |
| Toggle flag visibility (client) | Yes | Yes |
| Set flags on own records | Per consuming module rules | Yes |
| Add flags to registry | Via GM proxy | Yes |
| Rename flag globally | No | Yes (not protected) |
| Delete flag globally | No | Yes (not protected) |
| Register taxonomy at runtime | Via `blacksmithReady` hook (any module) | Yes |

---

## Migration from pin taxonomy

The existing pin tag system (`pinTagRegistry` setting, `pin-taxonomy.json`, tag methods on `PinsAPI`) is preserved during migration. The transition is additive: no data is deleted, no breaking API changes in the same major version.

### Step 1 — Extract to FlagManager

Move the core logic (normalize, registry CRUD, taxonomy merge, visibility) from `manager-pins.js` into `manager-flags.js`. `manager-pins.js` becomes a thin caller delegating to FlagManager.

### Step 2 — Add compatibility shim

On FlagManager init, if `flagAssignments` is empty and `pinTagRegistry` is non-empty, run a one-time migration:
- Read all pins from all scenes and the unplaced store.
- For each pin, read `pin.tags[]` and call `_writeAssignments(contextKey, pin.id, pin.tags)`.
- Seed `flagRegistry` from `pinTagRegistry`.
- Load `pin-taxonomy.json` and fold entries into `flag-taxonomy.json` context format.
- Set a world flag `flagsMigrationComplete: true` so the shim does not re-run.

### Step 3 — Redirect Pins API methods

Tag-related methods on `PinsAPI` (`getTagRegistry`, `registerPinTaxonomy`, `getPinTaxonomy`, etc.) become wrappers over `FlagsAPI`, keeping their existing signatures so callers do not break.

### Step 4 — Remove tags from pin objects

After one major version, stop reading `pin.tags[]` and stop writing it on pin update. Pin data readers fall back to `flags.getFlags(contextKey, pin.id)` instead. The `pin.tags` field is removed from the schema.

### Step 5 — Retire legacy settings and files

After confirming migration is complete for all active worlds, drop the `pinTagRegistry` setting and mark `pin-taxonomy.json` as deprecated. Remove both in the following major version.

---

## Integration pattern for consuming modules

A module that uses the Flags system for a new data type:

```javascript
// 1. Add the context to flag-taxonomy.json
// (no code registration required — JSON is the canonical source)

// 2. On record create/update, store flags via FlagsAPI
const flags = game.modules.get('coffee-pub-blacksmith')?.api?.flags;
await flags.setFlags('coffee-pub-squire.quests', quest.id, normalizedFlagsArray);

// 3. On record delete, clean up
await flags.deleteRecordFlags('coffee-pub-squire.quests', quest.id);

// 4. To read flags for a record
const questFlags = flags.getFlags('coffee-pub-squire.quests', quest.id);

// 5. To build a filter UI or tag input, embed FlagWidget in your window
// (see FlagWidget section above)
```

Runtime registration is available for dynamic or dev-time use only:

```javascript
Hooks.on('blacksmithReady', () => {
  game.modules.get('coffee-pub-blacksmith')?.api?.flags
    ?.register('coffee-pub-squire.quests', {
      label: 'Quests',
      flags: [{ key: 'main', protected: true }, { key: 'side', protected: true }]
    });
});
```

---

## Integration points (summary)

| Concern | Location / mechanism |
|---|---|
| Flag assignment storage | World setting `flagAssignments` (object: contextKey → recordId → flags[]) |
| World registry storage | World setting `flagRegistry` (array of strings) |
| Visibility storage | Client setting `flagVisibility` (object: flag or contextKey.flag → boolean) |
| Taxonomy (static) | `resources/flag-taxonomy.json` (all modules' contexts in one file) |
| Taxonomy (override) | World setting `flagTaxonomyOverrideJson` (path to optional override JSON) |
| Taxonomy (runtime) | `flags.register(contextKey, taxonomy)` during `blacksmithReady` |
| Core logic | `scripts/manager-flags.js` (FlagManager) |
| Public API | `scripts/api-flags.js` → `game.modules.get('coffee-pub-blacksmith')?.api?.flags` |
| UI widget | `scripts/widget-flags.js` (FlagWidget) — embeddable in any App V2 window |
| GM write proxy | `requestGM` / socket (same pattern as pins CRUD) |
| Pins compatibility | `manager-pins.js` delegates to FlagManager; `api-pins.js` tag methods wrap FlagsAPI |

---

## Design decisions

The following questions were resolved before implementation planning:

**Visibility scope:** Per-flag-globally, with optional per-context-key override. Hiding `"tavern"` globally hides it everywhere; a context override can make it visible (or hidden) specifically for one data type. This matches the most common use case (hide a noisy flag everywhere) while still allowing fine-grained control.

**Delete and rename semantics:** FlagManager owns all CRUD operations end-to-end, including stripping deleted or renamed flags from every record in `flagAssignments`. Because all flag-to-record assignments are stored centrally in Blacksmith, this is a single-store scan — no cross-module coordination or callback registration required.

**Taxonomy file ownership:** One shared `flag-taxonomy.json` shipped with Blacksmith contains all context entries for all coffee-pub modules. Modules contribute by updating this file, not by registering programmatically. Flags that drive module code behavior are marked `protected: true` in the taxonomy entry; the UI and FlagManager refuse to rename or delete them. Runtime registration remains available as a secondary convenience path for dynamic or dev-time scenarios.

**UI widget:** FlagWidget is a first-class Blacksmith component, not a per-module re-implementation. It covers the full interaction surface: display, add, remove, search, filter. It requires the Blacksmith Window API as a prerequisite and is intended to be embedded in Application V2 windows. A filter-only mode supports sidebar filter panels without the add/remove controls.

---

## Remaining work

See `TODO.md` for the master list. This document tracks design intent; implementation tasks are tracked there.
