# Tags API Documentation

**Audience:** Developers integrating with Blacksmith and using the Tags system from another module.

> **Architecture reference:** See `documentation/architecture/architecture-tags.md` for internals, storage design, the migration path from the pin tag system, and the TagWidget component specification.
>
> **Feature summary:**
> - **Central storage**: All tag assignments (record → flags) are stored in a Blacksmith world setting. Consuming modules do not store flags in their own record data.
> - **Context keys**: Every tag operation is scoped to a `{moduleId}.{dataType}` context key (e.g. `"coffee-pub-squire.quests"`). This allows the same flag name to exist independently in different data types.
> - **Taxonomy**: `resources/tag-taxonomy.json` defines the suggested tag set for each context. Modules contribute by adding their context entries to this file. Protected flags (those that drive module code) are marked `protected: true` and cannot be renamed or deleted.
> - **Global flags**: Tags like `"todo"` and `"revisit"` are offered as suggestions in every context.
> - **Visibility**: Per-flag-globally by default, with an optional per-context override. Visibility is client-scope and affects filtering only — it does not remove flags from data.
> - **TagWidget**: A reusable Blacksmith UI component for flag selection, search, add, and remove. Embed in any Application V2 window; requires the Blacksmith Window API.
> - **GM-only mutations**: Rename and delete operate across all records in all contexts and require GM privileges.

---

## Overview

The Tags API provides a shared labeling infrastructure for all coffee-pub modules. Use it to attach classification labels to your records, offer a consistent UI for choosing and filtering tags, and let the GM manage the world's flag vocabulary in one place.

A **tag** is a normalized string: lowercase, hyphen-separated, no spaces (e.g. `"main-quest"`, `"tavern"`, `"todo"`). A **context key** scopes a tag taxonomy and its record assignments to one module + data type (e.g. `"coffee-pub-squire.quests"`).

### When to use the Tags API

- You have records (quests, codex entries, notes, items) that users want to classify and filter.
- You want a consistent flag UI without building tag-input, chip rendering, or search from scratch.
- You want the GM to be able to rename or delete a flag world-wide and have it propagate to all records automatically.

### When not to use it

- For boolean or typed metadata on a record (use your own data model). Flags are display labels, not typed configuration fields.
- For system-level classification that drives rendering or behavior and never changes (use your `type` field or constants instead — and if you do define such values in the taxonomy, mark them `protected: true`).

---

## Implementation structure

| File | Role |
|---|---|
| `scripts/manager-tags.js` | TagManager — core logic, storage, normalization |
| `scripts/api-tags.js` | TagsAPI — public wrapper (this document) |
| `scripts/widget-tags.js` | TagWidget — embeddable UI component |
| `templates/partials/tag-widget.hbs` | TagWidget Handlebars template |
| `styles/widget-tags.css` | TagWidget styles |
| `resources/tag-taxonomy.json` | Canonical taxonomy for all coffee-pub contexts |

---

## Getting started

### Accessing the API

```javascript
const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
if (!tags?.isAvailable()) return;
```

### Availability check

Call `isAvailable()` before any API use. The Tags API is ready as soon as Blacksmith initializes — it does not require the canvas.

### Add your context to the taxonomy

Add your context key entry to `resources/tag-taxonomy.json` before shipping:

```json
{
  "version": 1,
  "globalTags": ["todo", "revisit", "avoid", "complete"],
  "contexts": {
    "coffee-pub-squire.quests": {
      "label": "Quests",
      "tags": [
        { "key": "main", "protected": true },
        { "key": "side", "protected": true },
        { "key": "backstory" },
        { "key": "faction" }
      ]
    }
  }
}
```

Mark `protected: true` on any flag your code checks by value (e.g. `if (flags.includes('main'))`). Protected flags cannot be renamed or deleted by a GM.

### Attach flags to a record

```javascript
Hooks.on('blacksmithReady', async () => {
  const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
  if (!tags?.isAvailable()) return;

  // Set flags on a record (replaces any existing flags for this record)
  await tags.setTags('coffee-pub-squire.quests', quest.id, ['main', 'faction']);
});
```

### Clean up on record delete

```javascript
await tags.deleteRecordTags('coffee-pub-squire.quests', quest.id);
```

### Embed the flag widget in a window

See [TagWidget](#TagWidget) below for the full embed pattern.

---

## API Reference

### Availability

#### `tags.isAvailable()`

Returns `true` if the Tags API is loaded and ready. Safe to call at any time, including before `ready`.

**Returns:** `boolean`

```javascript
const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
if (!tags?.isAvailable()) {
  console.warn('Blacksmith Tags API not available');
  return;
}
```

---

### Taxonomy

#### `flags.register(contextKey, taxonomy)`

Merge a taxonomy entry into the in-memory registry at runtime. Useful for dev-time testing or dynamic contexts not known at ship time. For shipped modules, prefer adding entries directly to `tag-taxonomy.json`.

Runtime entries merge on top of the JSON entries — runtime wins on key collision.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier in `{moduleId}.{dataType}` format |
| `taxonomy` | `object` | `{ label: string, flags: Array<{ key: string, protected?: boolean }> }` |

**Returns:** `void`

```javascript
Hooks.on('blacksmithReady', () => {
  const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
  tags?.register('coffee-pub-squire.quests', {
    label: 'Quests',
    flags: [
      { key: 'main', protected: true },
      { key: 'side', protected: true },
      { key: 'backstory' },
      { key: 'faction' }
    ]
  });
});
```

---

#### `tags.getChoices(contextKey)`

Get the full list of suggested flags for a context: the context's taxonomy flags plus global flags. Use this to populate a dropdown, chip input, or TagWidget's suggestion list.

Flags are returned in taxonomy order, with global flags appended. Protected flags are included; the caller can use the `protected` field to style or sort them differently.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |

**Returns:** `Array<{ key: string, label: string, protected: boolean, tier: 'taxonomy' \| 'global' }>`

```javascript
const choices = tags.getChoices('coffee-pub-squire.quests');
// [
//   { key: 'main',      label: 'Main',      protected: true,  tier: 'taxonomy' },
//   { key: 'side',      label: 'Side',      protected: true,  tier: 'taxonomy' },
//   { key: 'backstory', label: 'Backstory', protected: false, tier: 'taxonomy' },
//   { key: 'todo',      label: 'Todo',      protected: false, tier: 'global'   },
// ]
```

---

### Record flag CRUD

All CRUD methods write to the central `tagAssignments` world setting. Non-GM users go through the GM proxy automatically — you do not need to handle that routing.

#### `tags.setTags(contextKey, recordId, flagArray)`

Replace the flag set for a record. Normalizes the input array before storing. Adds any new flags to the world registry.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `recordId` | `string` | Unique identifier of the record within this context |
| `flagArray` | `string[]` | The complete new flag set (replaces existing) |

**Returns:** `Promise<void>`

```javascript
// On quest save
await tags.setTags('coffee-pub-squire.quests', quest.id, ['main', 'faction', 'todo']);
```

---

#### `tags.getTags(contextKey, recordId)`

Get the current flags for a record. Returns an empty array if the record has no flags.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `recordId` | `string` | Record identifier |

**Returns:** `string[]`

```javascript
const questFlags = tags.getTags('coffee-pub-squire.quests', quest.id);
// ['main', 'faction', 'todo']
```

---

#### `flags.addTags(contextKey, recordId, flagArray)`

Add flags to a record without replacing its existing flags. Duplicates are deduplicated automatically. Adds any new flags to the world registry.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `recordId` | `string` | Record identifier |
| `flagArray` | `string[]` | Flags to add |

**Returns:** `Promise<void>`

```javascript
// Mark a quest complete without touching its other flags
await tags.addTags('coffee-pub-squire.quests', quest.id, ['complete']);
```

---

#### `flags.removeTags(contextKey, recordId, flagArray)`

Remove specific flags from a record. Flags not present on the record are silently ignored.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `recordId` | `string` | Record identifier |
| `flagArray` | `string[]` | Flags to remove |

**Returns:** `Promise<void>`

```javascript
// Un-complete a quest
await tags.removeTags('coffee-pub-squire.quests', quest.id, ['complete']);
```

---

#### `tags.deleteRecordTags(contextKey, recordId)`

Remove all flag data for a record. Call this when the record itself is deleted to avoid orphan entries in the assignment store.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `recordId` | `string` | Record identifier |

**Returns:** `Promise<void>`

```javascript
// In your module's record delete handler
await tags.deleteRecordTags('coffee-pub-squire.quests', deletedQuest.id);
```

---

#### `tags.getRecordsByTag(contextKey, flag)`

Get all record IDs in a context that currently have a specific flag. Useful for building filter views.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier |
| `flag` | `string` | Flag to look up |

**Returns:** `string[]` — array of record IDs

```javascript
// Find all quests tagged 'faction'
const factionQuestIds = tags.getRecordsByTag('coffee-pub-squire.quests', 'faction');
```

---

### Registry management

These methods operate on the world-level flag registry. Rename and delete require GM privileges and propagate across all contexts and records automatically.

#### `tags.getRegistry()`

Get the full world flag list — every flag ever used in any context, including custom and orphan flags.

**Returns:** `string[]` — sorted array of normalized flag strings

```javascript
const allFlags = tags.getRegistry();
// ['avoid', 'backstory', 'complete', 'faction', 'main', 'revisit', 'tavern', 'todo', ...]
```

---

#### `tags.normalize(flagArray)`

Normalize an array of flag strings: lowercase, replace spaces with hyphens, deduplicate. Use this before storing flags you receive from user input.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `flagArray` | `string[]` | Raw input flags |

**Returns:** `string[]` — normalized, deduplicated

```javascript
const clean = tags.normalize(['Main Quest', 'FACTION', 'main quest']);
// ['main-quest', 'faction']
```

---

#### `flags.rename(oldFlag, newFlag)`

Rename a flag globally. Updates every record in every context that uses `oldFlag`, then updates the registry. Silently rejected if `oldFlag` is protected.

**GM only.** Non-GM callers receive a warning and no change is made.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `oldFlag` | `string` | Existing flag key |
| `newFlag` | `string` | Replacement flag key (will be normalized) |

**Returns:** `Promise<{ updated: number } \| null>` — number of records updated, or `null` if rejected

```javascript
// Rename 'backstory' → 'lore' across all contexts and records
const result = await tags.rename('backstory', 'lore');
// { updated: 14 }
```

---

#### `flags.delete(flag)`

Delete a flag globally. Removes it from every record in every context, then removes it from the registry. Silently rejected if the flag is protected.

**GM only.** Non-GM callers receive a warning and no change is made.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `flag` | `string` | Flag key to delete |

**Returns:** `Promise<{ removed: number } \| null>` — number of records affected, or `null` if rejected

```javascript
const result = await tags.delete('old-unused-tag');
// { removed: 3 }
```

---

#### `tags.seedRegistry(contextKey, existingFlagArrays)`

Populate the world registry from a flat list of flag arrays. Use this once during your module's first-run initialization to ensure the registry reflects all flags already present in your existing data — before any user interaction has created them through normal use.

If the registry already contains a flag it is not duplicated.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `contextKey` | `string` | Context identifier (used for logging only) |
| `existingFlagArrays` | `string[][]` | Array of flag arrays, one per record |

**Returns:** `Promise<void>`

```javascript
// On first load: seed registry from all existing quests
const allQuestFlags = myQuests.map(q => tags.getTags('coffee-pub-squire.quests', q.id));
await tags.seedRegistry('coffee-pub-squire.quests', allQuestFlags);
```

---

### Visibility

Visibility is client-scope (per-user) and affects UI filtering only. It does not remove flags from stored data or prevent other users from seeing them.

**Resolution order:** Context override → global default → `true` (visible if no entry exists).

#### `tags.setVisibility(flag, visible, contextKey?)`

Set the visibility of a flag. If `contextKey` is provided, this sets a context-specific override. If omitted, it sets the global default for that flag across all contexts.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `flag` | `string` | Flag key |
| `visible` | `boolean` | Whether the flag should be visible in filter UIs |
| `contextKey` | `string?` | Optional — scope override to one context |

**Returns:** `void`

```javascript
// Hide 'todo' globally (across all contexts for this user)
tags.setVisibility('todo', false);

// Hide 'backstory' only in the quests context
tags.setVisibility('backstory', false, 'coffee-pub-squire.quests');

// Restore 'backstory' visibility in quests (removes the context override)
tags.setVisibility('backstory', true, 'coffee-pub-squire.quests');
```

---

#### `tags.getVisibility(flag, contextKey?)`

Get the effective visibility of a flag for the current user. Applies context override → global default → `true` fallback.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `flag` | `string` | Flag key |
| `contextKey` | `string?` | Optional — check effective visibility for a specific context |

**Returns:** `boolean`

```javascript
// Is 'todo' visible in the quests context?
const visible = tags.getVisibility('todo', 'coffee-pub-squire.quests');
```

---

## TagWidget

TagWidget is a Blacksmith UI component for selecting and managing flags. Embed it in any Application V2 window instead of building your own tag input.

**Prerequisite:** Your window must use the Blacksmith Window API (`documentation/api/api-window.md`). TagWidget follows the same lifecycle and CSS conventions.

### Capabilities

| Mode | Supports |
|---|---|
| **Full** (default) | Display existing flags as removable chips, input with live search against suggestions, add custom flags, remove flags |
| **Filter** | Display flags as visibility toggles only — no add/remove. Use for sidebar filter panels. |

### Embed pattern

**1. In `prepareContext()` — build widget data:**

```javascript
async prepareContext(options) {
  const context = await super.prepareContext(options);
  const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
  const currentFlags = tags.getTags('coffee-pub-squire.quests', this.questId);

  context.TagWidget = TagWidget.prepareData({
    contextKey: 'coffee-pub-squire.quests',
    currentTags,
    mode: 'full'            // 'full' or 'filter'
  });

  return context;
}
```

**2. In your Handlebars template — include the partial:**

```handlebars
<div class="quest-flags-section">
  {{> blacksmith-tag-widget tags=TagWidget}}
</div>
```

**3. On save — read the widget value and persist:**

```javascript
async _onSubmit(event, form, formData) {
  const tags = game.modules.get('coffee-pub-blacksmith')?.api?.tags;
  const newTags = TagWidget.readValue(this.element, 'coffee-pub-squire.quests');
  await tags.setTags('coffee-pub-squire.quests', this.questId, newFlags);
  // ... rest of save
}
```

### Accessing TagWidget

```javascript
const { TagWidget } = game.modules.get('coffee-pub-blacksmith')?.api?.tags ?? {};
```

### `TagWidget.prepareData(options)`

Prepare the template data object for the widget partial.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `options.contextKey` | `string` | Context identifier |
| `options.currentFlags` | `string[]` | Flags currently on the record |
| `options.mode` | `'full' \| 'filter'` | Widget mode (default: `'full'`) |
| `options.placeholder` | `string?` | Input placeholder text (full mode only) |

**Returns:** `object` — template data, pass directly to the `{{> blacksmith-tag-widget}}` partial

---

### `TagWidget.readValue(element, contextKey)`

Read the current flag selection from a rendered widget inside `element`. Call this in your `_onSubmit` or change handler.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The window's root element (e.g. `this.element`) |
| `contextKey` | `string` | Context identifier (must match the one used in `prepareData`) |

**Returns:** `string[]` — normalized array of selected flags

---

## Hooks

The Flags system fires the following Foundry hooks:

| Hook | When | Payload |
|---|---|---|
| `blacksmith.tags.registered` | A taxonomy is registered (JSON load or runtime) | `{ contextKey, taxonomy }` |
| `blacksmith.tags.renamed` | A flag is renamed globally (GM only) | `{ oldTag, newTag, updated: number }` |
| `blacksmith.tags.deleted` | A flag is deleted globally (GM only) | `{ tag, removed: number }` |
| `blacksmith.tags.changed` | Flags are set/added/removed on a record | `{ contextKey, recordId, flags: string[] }` |

---

## Integration checklist

When adding Tags support to a new module or data type:

- [ ] Add your context key to `resources/tag-taxonomy.json`. Mark `protected: true` on any flags your code checks by value.
- [ ] Call `tags.setTags(contextKey, recordId, flagArray)` when saving a record.
- [ ] Call `tags.deleteRecordTags(contextKey, recordId)` when deleting a record.
- [ ] Call `tags.seedRegistry(contextKey, existingArrays)` once on first load to populate the registry from pre-existing data.
- [ ] Embed `TagWidget` in your record's edit window.
- [ ] Use `tags.getRecordsByTag(contextKey, flag)` to power any filter UI.
- [ ] Check `tags.isAvailable()` before all API calls from outside Blacksmith.

---

## Troubleshooting

**Tags are not appearing in suggestions**
- Verify your context key is in `tag-taxonomy.json` (or registered at runtime before the UI opens).
- Check that `tags.getChoices(contextKey)` returns your expected flags in the console.

**Rename / delete silently does nothing**
- Confirm the calling user is GM.
- Check if the flag is marked `protected: true` in the taxonomy — protected flags cannot be renamed or deleted.

**TagWidget is not rendering**
- Confirm your window extends the Blacksmith Window API (see `documentation/api/api-window.md`).
- Confirm you are passing the `TagWidget` value from `prepareData()` to the template context, not constructing the object manually.

**Record tags are empty after reload**
- Verify you are calling `setTags` (not just updating your own record data).
- Check the `tagAssignments` world setting in the browser console: `game.settings.get('coffee-pub-blacksmith', 'tagAssignments')`.


