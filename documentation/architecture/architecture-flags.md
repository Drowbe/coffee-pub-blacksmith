# Flags System Architecture

**Audience:** Contributors to the Blacksmith codebase.

This document describes how the Flags system is built and how its parts interact. It is an architecture reference, not an API reference (see `api-flags.md` for the public API).

## Overview

The Flags system is a module-agnostic labeling infrastructure. Any coffee-pub module can register a **taxonomy** of recommended flags for a data type, attach flags to its records, and rely on Blacksmith to manage the world-level registry, normalization, rename/delete, and per-user visibility.

"Flag" in this system means a normalized classification label (e.g., `"tavern"`, `"main-quest"`, `"todo"`). This is distinct from FoundryVTT's `document.flags` API, which is a generic key-value store on documents.

**Target:** FoundryVTT v13+.

**Relationship to Pins:** The Pins tag system (currently in `manager-pins.js` and `api-pins.js`) is the v0 implementation that this system generalizes. On extraction, Pins becomes a consumer of the Flags API. All existing pin tag data and settings remain in place; the Flags manager reads from the pins registry during a migration window (see Migration section).

---

## Core Concepts

| Concept | Description |
|---|---|
| **Flag** | A normalized string label: lowercase, hyphen-separated, no spaces. E.g., `"main-quest"`. |
| **Context key** | Scopes a taxonomy to one module + data type. Format: `{moduleId}.{dataType}`. E.g., `"coffee-pub-blacksmith.journal-pin"`, `"coffee-pub-squire.quests"`. |
| **Taxonomy** | A predefined set of recommended flags for a given context key. Registered from JSON or at runtime. |
| **Global flags** | Flags that apply across all contexts regardless of module. E.g., `"todo"`, `"revisit"`. |
| **Registry** | The world-level list of all known flags. Grows as users create custom flags; shrinks on delete. |
| **Custom flags** | Freeform flags created by users, not present in any taxonomy. |
| **Orphan flags** | Flags in the registry that no longer appear on any record and are not in any taxonomy. |

### Three-tier flag classification

Every flag in the registry falls into one tier:

1. **Taxonomy flag** — defined in `flag-taxonomy.json` or registered at runtime. Shown as "Suggested" in UI. Protected from bulk delete.
2. **Custom flag** — user-created, not in any taxonomy. Shown as "Custom" in UI. Can be cleaned up by GM.
3. **Orphan flag** — in the registry but not actively used and not in any taxonomy. Shown as "Orphan" in UI; can be pruned.

---

## Storage

### World registry

- **Where:** World setting `flagRegistry` (array of normalized flag strings, GM-writable).
- **When:** Grows on first use of any new flag; shrinks on `delete()`.
- **Scope:** One registry for the whole world, shared across all modules and contexts.

### Per-context visibility

- **Where:** Client setting `flagVisibility` (object keyed `{contextKey}.{flag}` → `boolean`).
- **Scope:** Per-user, client side. Affects UI filtering only; does not remove flags from data.

### Taxonomy (static)

- **Where:** `resources/flag-taxonomy.json` (shipped with Blacksmith) and an optional override JSON at `flagTaxonomyOverrideJson` world setting path.
- **Runtime registration:** Modules can also call `register(contextKey, taxonomy)` during `blacksmithReady` to add or merge taxonomy entries without touching the JSON.

### Owning module data

The Flags system does **not** store flag arrays for individual records. Each consuming module owns that storage. For pins, flags live in the pin object (`pin.flags[]`) inside scene flags or the unplaced store. For a future Squire actor note, flags would live wherever Squire stores that record.

---

## Components

### FlagManager (`scripts/manager-flags.js`)

Core logic. No UI, no module-specific knowledge.

**Responsibilities:**
- Load and merge taxonomy from JSON, override JSON, and runtime registrations.
- Normalize flag arrays: deduplicate, lowercase, replace spaces with hyphens.
- CRUD on the world registry: add, rename, delete.
- Classify flags into taxonomy / custom / orphan tiers.
- Manage per-user visibility state.
- Seed the registry from existing data on first run.

**Key internal methods:**

| Method | Purpose |
|---|---|
| `_loadTaxonomy()` | Parse `flag-taxonomy.json` + override; store in `_builtinTaxonomy`. |
| `_getRuntimeTaxonomy()` | Return the in-memory runtime registry (populated by `register()`). |
| `_mergeTaxonomy(contextKey)` | Merge built-in, override, and runtime entries for one context. |
| `_normalize(flags[])` | Returns deduplicated, lowercased, hyphenated array. |
| `_getRegistry()` | Read world setting `flagRegistry`. |
| `_writeRegistry(flags[])` | Write world setting (GM-only path). |

### FlagsAPI (`scripts/api-flags.js`)

Public interface. Thin wrapper over FlagManager. Consumed via `game.modules.get('coffee-pub-blacksmith')?.api?.flags`.

See `api-flags.md` for full method contracts. High-level surface:

- `register(contextKey, taxonomy)` — register or merge a taxonomy at runtime.
- `getChoices(contextKey)` — get suggested flags (taxonomy + globals) for a UI dropdown or chip input.
- `getRegistry()` — get the full world flag list.
- `normalize(flags[])` — normalize a flag array.
- `rename(oldFlag, newFlag)` — rename globally across registry (GM only).
- `delete(flag)` — remove from registry (GM only). Does not strip from records; consuming module is responsible.
- `setVisibility(contextKey, flag, visible)` — client-scope visibility toggle.
- `getVisibility(contextKey, flag)` — read visibility state.
- `seedRegistry(contextKey, existingFlags[])` — one-time call to populate registry from existing record data.

### Taxonomy JSON (`resources/flag-taxonomy.json`)

Replaces `pin-taxonomy.json` as the canonical taxonomy source. Format:

```json
{
  "version": 1,
  "globalFlags": ["todo", "revisit", "avoid", "complete"],
  "contexts": {
    "coffee-pub-blacksmith.journal-pin": {
      "label": "Journal Page",
      "flags": ["narrative", "backstory", "encounter", "travel", "location", "tavern", "shop", "character", "quest", "rumor", "information"]
    },
    "coffee-pub-squire.note": {
      "label": "Note",
      "flags": ["party", "personal", "sticky"]
    }
  }
}
```

`pin-taxonomy.json` remains in place during the migration window and is read by the compatibility shim in FlagManager.

---

## Data flow

### Flag normalization

```
raw input (user text or API call)
  → split on comma/space
  → lowercase
  → replace spaces with hyphens
  → deduplicate
  → normalize output array
```

### Taxonomy resolution for a context key

```
1. Load built-in JSON entries for contextKey
2. Merge override JSON entries (override wins on collision)
3. Merge runtime-registered entries (runtime wins on collision)
4. Append globalFlags
→ return merged flag list as "suggested"
```

### Registry write path

Non-GM users cannot write world settings directly. Any registry mutation (add, rename, delete) goes through the GM proxy via `requestGM` / socket, same pattern as pin CRUD. FlagManager detects GM status and routes accordingly.

---

## Permission model

| Operation | Player | GM |
|---|---|---|
| Read registry | Yes | Yes |
| Read taxonomy | Yes | Yes |
| Toggle flag visibility (client) | Yes | Yes |
| Add flags to own records | Per consuming module | Yes |
| Add flags to registry | Via GM proxy | Yes |
| Rename flag globally | No | Yes |
| Delete flag globally | No | Yes |
| Register taxonomy at runtime | Via `blacksmithReady` hook (any module) | Yes |

---

## Migration from pin taxonomy

The existing pin tag system (`pinTagRegistry` setting, `pin-taxonomy.json`, tag methods on `PinsAPI`) is preserved during migration. The transition is additive: no data is deleted, no breaking API changes.

### Step 1 — Extract to FlagManager

Move the core logic (normalize, registry CRUD, taxonomy merge, visibility) from `manager-pins.js` into `manager-flags.js`. `manager-pins.js` becomes a thin caller.

### Step 2 — Add compatibility shim

FlagManager reads `pinTagRegistry` and `pin-taxonomy.json` and folds them into the unified registry and taxonomy on first load. The context key for pins is `"coffee-pub-blacksmith.journal-pin"` (and other pin types already in the JSON).

### Step 3 — Redirect Pins API methods

Tag-related methods on `PinsAPI` (`getTagRegistry`, `registerPinTaxonomy`, `getPinTaxonomy`, etc.) become wrappers over `FlagsAPI`, keeping their existing signatures so callers don't break.

### Step 4 — Migrate setting key

After one major version, write registry data to `flagRegistry` and stop reading `pinTagRegistry`. The shim reads both for one release, then drops the old key.

### Step 5 — Deprecate pin-taxonomy.json

After `flag-taxonomy.json` is in place and the override setting updated, mark `pin-taxonomy.json` as deprecated. Remove after one major version.

---

## Integration pattern for consuming modules

A module that wants to use the Flags system:

```javascript
Hooks.on('blacksmithReady', () => {
  const flags = game.modules.get('coffee-pub-blacksmith')?.api?.flags;
  if (!flags) return;

  flags.register('coffee-pub-squire.quests', {
    label: 'Quests',
    flags: ['main', 'side', 'backstory', 'faction']
  });
});
```

When building a UI for tagging records, call `flags.getChoices('coffee-pub-squire.quests')` to get the suggested set. Normalize user input with `flags.normalize(rawInput)` before storing. Call `flags.seedRegistry(contextKey, existingFlags)` once on first load to populate the world registry from existing data.

The Flags system does not dictate where the consuming module stores flag arrays on its records. That is the module's responsibility.

---

## Integration points (summary)

| Concern | Location / mechanism |
|---|---|
| World registry storage | World setting `flagRegistry` (array of strings) |
| Visibility storage | Client setting `flagVisibility` (object) |
| Taxonomy (static) | `resources/flag-taxonomy.json` |
| Taxonomy (override) | World setting `flagTaxonomyOverrideJson` (path to JSON file) |
| Taxonomy (runtime) | `flags.register(contextKey, taxonomy)` during `blacksmithReady` |
| Core logic | `scripts/manager-flags.js` (FlagManager) |
| Public API | `scripts/api-flags.js` → `game.modules.get('coffee-pub-blacksmith')?.api?.flags` |
| GM write proxy | `requestGM` / socket (same pattern as pins CRUD) |
| Pins compatibility | `manager-pins.js` delegates to FlagManager; `api-pins.js` tag methods wrap FlagsAPI |

---

## Open questions

These decisions should be resolved before implementation begins:

1. **Visibility scope**: Should visibility be per-context-key (hide `"tavern"` only on journal pins) or per-flag-globally (hide `"tavern"` everywhere)? Current pins implementation is per-type; a unified system might prefer per-flag-globally with an optional context override.

2. **Delete semantics**: When a GM deletes a flag from the registry, should Blacksmith also strip it from records (expensive cross-module scan) or leave that to the consuming module? Leaving it to the consuming module is cleaner but can leave orphaned data.

3. **Taxonomy file ownership**: One shared `flag-taxonomy.json` (all modules contribute) vs each module ships its own taxonomy JSON and registers it. Shared file is simpler now but creates coupling at the file level. Runtime registration is more modular.

4. **Reusable UI components**: Should the flag chip input and filter panel be extracted as Blacksmith UI components (Handlebars partials + JS)? Doing so would let Squire and Artificer build flag UIs without re-implementing them, but it broadens the scope of this extraction.

---

## Remaining work

See `TODO.md` for the master list. This document tracks design intent; implementation tasks are tracked there.
