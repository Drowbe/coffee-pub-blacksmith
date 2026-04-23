# Pin API — Integration & Migration Guide

**Audience:** Developers of Coffee Pub modules (Squire, Artificer, Minstrel, etc.) integrating with the Blacksmith Pins API as of **v13.6.3**.

For the full method reference see [`api-pins.md`](../api/api-pins.md).

---

## What changed in 13.6.3

| Area | Change |
|------|--------|
| Journal toolbar | Tag chip row added below icon row. Tags are sourced from `getPinTaxonomy` (registered type tags only). State (selected icon + tags) is restored on open. Default tag "narrative" selected when no saved pin state exists. |
| `getPinTaxonomy` vs `getPinTaxonomyChoices` | **Breaking for UI**: `getPinTaxonomyChoices` merges registered tags with every global tag ever used (all modules). Use `getPinTaxonomy` when populating a tag picker for a specific pin type so only that type's tags appear. |
| Player Visibility | New field (`config.blacksmithVisibility`) separate from ownership. `'visible'` (default) or `'hidden'`. Editable in Configure Pin > Permissions. Exposed in Browse view with a per-pin toggle. |
| Context menu | "Delete All Pins" and "Delete All [Type] Pins" removed. "Visibility" renamed to "Player Visibility". Bulk delete is now in the Pin Layers action bar. |
| Configure Pin — Permissions | "Allow Duplicates" moved from header into the Permissions section. Player Visibility dropdown added alongside ownership. Both are included in "Update All" (permissions section) and "Use as Default" (if Permissions section is checked). |
| Configure Pin — action bar | "Update All [type] Pins" toggle moved to action bar left (was a header toggle). When active, a "Filter by tag:" chip row appears showing all tags used by same-type pins on the scene. Current pin's tags are pre-selected. Multiselect OR logic — type is always the first gate, tags narrow within it. |
| Configure Pin — Use as Default | "Default for [type]" toggle now shows per-section checkboxes so you can choose which sections (Design, Text, Animations, Source, Classification, Permissions) are saved as the default. |
| Browse view — Player Visibility icon | Per-pin Player Visibility button now uses `fa-users` / `fa-users-slash` instead of `fa-eye` / `fa-eye-slash` to avoid confusion with layer-level visibility controls. |
| Window position persistence | All `BlacksmithWindowBaseV2` windows now save and restore their position and size via `localStorage`. No code changes needed in subclasses. |

---

## What changed in 13.6.2

| Area | Change |
|------|--------|
| Groups | **Removed.** Any `group` values on existing pins are auto-migrated into `tags` on schema load (v4). Remove all `group` references from your module. |
| Tags | Now the primary user-facing classification. Always supply at least one tag when creating a pin. |
| Taxonomy JSON | **v3 format** — structured by `moduleId` under a `modules` key, with a top-level `globalTags` array. Single `tags` array per category (no `defaultTags` / `suggestedTags`). |
| Tag registry | New world-level registry (`getTagRegistry`, `deleteTagGlobally`, `renameTagGlobally`). Seeded automatically from taxonomy + existing pins on `ready`. |
| Non-square pins | Rendering fixed — `size.w` and `size.h` are now applied independently. You can safely use non-square dimensions. |
| Configure Pin window | Header shows `Category: Pin Title`. "Update All" toggle lets GMs bulk-apply selected sections to same-type pins. |

---

## 1. Always register your pin taxonomy

Register your taxonomy in `Hooks.once('ready', ...)` **before** you create any pins. This populates the Configure Pin tag suggestions and the Pin Layers window.

```javascript
Hooks.once('ready', () => {
    const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
    if (!pins?.isAvailable()) return;

    pins.registerPinTaxonomy('coffee-pub-squire', {
        pinCategories: {
            'journal-pin': {
                label: 'Journal Pin',
                tags: ['location', 'shop', 'npc', 'quest', 'rumor', 'reference', 'gm-notes']
            },
            'quest-pin': {
                label: 'Quest Pin',
                tags: ['active', 'completed', 'failed', 'side-quest', 'main-quest']
            }
        }
    });
});
```

**Rules:**
- `moduleId` must match your `module.json` `id`.
- `type` keys (e.g. `'journal-pin'`) are the coarse technical category — they show in the UI as "Category".
- `tags` are the fine-grained user-facing labels. Use lowercase kebab-case (`'npc'`, `'gm-notes'`).
- Call `registerPinTaxonomy` once per module, once per `ready`. Calling it again merges tags.

---

## 2. Always create pins with a type and at least one tag

```javascript
// BEFORE (missing type and tags — avoid this)
await pins.create({
    moduleId: 'coffee-pub-squire',
    text: 'The Rusty Anchor',
    x: 1200, y: 800,
    sceneId: canvas.scene.id
});

// AFTER (correct)
await pins.create({
    moduleId: 'coffee-pub-squire',
    type: 'journal-pin',          // matches a key in your registered taxonomy
    tags: ['location', 'shop'],   // at least one tag
    text: 'The Rusty Anchor',
    x: 1200, y: 800,
    sceneId: canvas.scene.id
});
```

**Why it matters:**
- `type` drives which taxonomy choices appear in Configure Pin and what label shows in the header (`Category: Pin Title`).
- Tags populate the Pin Layers tag cloud and enable per-tag visibility filtering for players.
- Pins without tags are invisible to the tag-based visibility system.

---

## 3. Remove all `group` references

The `group` field no longer exists. Replace any usage with `tags`.

```javascript
// BEFORE
await pins.create({ ..., group: 'tavern' });
await pins.update(pinId, { group: 'inn' });
const byGroup = pinList.filter(p => p.group === 'tavern');

// AFTER
await pins.create({ ..., tags: ['tavern'] });
await pins.update(pinId, { tags: ['inn'] });
const byTag = pinList.filter(p => p.tags?.includes('tavern'));
```

Existing pin data with `group` values will be auto-migrated to `tags` by the schema (v4 migration). You do not need to manually migrate stored data.

---

## 4. Use the tag registry for autocomplete / UI

The world tag registry is the full deduplicated list of every tag across all modules and all scenes. Use it to populate dropdowns or suggestion lists in your own UI.

```javascript
const pins = game.modules.get('coffee-pub-blacksmith')?.api?.pins;
const allTags = pins.getTagRegistry();
// → ['encounter', 'gm-notes', 'location', 'npc', 'quest', ...]
```

The registry is seeded automatically on `ready`. You do not need to call `seedTagRegistryIfEmpty()` unless you are registering taxonomy late and need to force a merge.

---

## 5. Update your taxonomy JSON (if you ship one)

If your module ships a `pin-taxonomy.json`, update it to the **v3 format**:

```json
{
    "version": 3,
    "globalTags": ["location", "quest", "npc"],
    "modules": {
        "coffee-pub-squire": {
            "pinCategories": {
                "journal-pin": {
                    "label": "Journal Pin",
                    "tags": ["location", "shop", "npc", "quest", "rumor", "reference", "gm-notes"]
                },
                "quest-pin": {
                    "label": "Quest Pin",
                    "tags": ["active", "completed", "failed", "side-quest", "main-quest"]
                }
            }
        }
    }
}
```

**Key differences from v2:**
- No `defaultTags` or `suggestedTags` — use a single `tags` array.
- No flat `pinCategories` at the root — nest under `modules.{moduleId}.pinCategories`.
- Add `globalTags` at the root for tags that apply across all modules/categories.
- `"version": 3` is required for the new loader.

Blacksmith's built-in taxonomy at `resources/pin-taxonomy.json` already uses this format and covers Blacksmith, Squire, and Artificer pin types.

---

## 6. Non-square pins now work correctly

Pins with different width and height now render correctly. You can safely create rectangular pins.

```javascript
await pins.create({
    moduleId: 'coffee-pub-squire',
    type: 'journal-pin',
    tags: ['location'],
    text: 'World Map',
    size: { w: 120, h: 240 },   // tall pin — will render as 120×240
    shape: 'square',
    sceneId: canvas.scene.id,
    x: 500, y: 500
});
```

Previously `size.h` was silently ignored and the pin always rendered as a square using `Math.min(w, h)`.

---

## 7. Ownership — hide from players by default for GM-only pins

```javascript
const NONE = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;       // 0 — hidden from players
const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER; // 2 — players can see & click

await pins.create({
    moduleId: 'coffee-pub-squire',
    type: 'journal-pin',
    tags: ['gm-notes'],
    text: 'Secret Location',
    ownership: { default: NONE },   // GM-only
    sceneId: canvas.scene.id,
    x: 800, y: 600
});
```

GMs always see all pins regardless of ownership. Players only see pins where `ownership.default >= OBSERVER` or their user ID has a per-user override.

---

## 8. Reconcile pins after bulk operations

If your module tracks pin IDs externally (e.g., in journal entry flags), use `reconcile()` after bulk deletes to repair broken links.

```javascript
const result = await pins.reconcile({
    moduleId: 'coffee-pub-squire',
    sceneId: canvas.scene.id,
    getPinId: (entry) => entry.flags?.['coffee-pub-squire']?.pinId,
    setPinId: async (entry, pinId) => {
        await entry.setFlag('coffee-pub-squire', 'pinId', pinId);
    },
    items: journalEntries
});
console.log(`Reconciled: ${result.kept} kept, ${result.cleared} cleared`);
```

---

---

## 9. Use `getPinTaxonomy` (not `getPinTaxonomyChoices`) for type-scoped tag pickers

`getPinTaxonomyChoices(moduleId, type)` merges the registered tags for that type with **every global tag ever written to any pin** across all modules. It is useful for showing all possible completion options in a free-form input. It is **not** suitable for a tag chip picker scoped to a specific type — it will show tags from unrelated modules and types.

Use `getPinTaxonomy(moduleId, type)` to get only the tags registered for that specific pin type:

```javascript
// WRONG — includes all global tags from every module
const choices = pins.getPinTaxonomyChoices('coffee-pub-squire', 'quest-pin');
// choices.tags may include 'encounter', 'narrative', 'tavern', etc. from other modules

// CORRECT — only the tags registered for quest-pin
const taxonomy = pins.getPinTaxonomy('coffee-pub-squire', 'quest-pin');
const tags = taxonomy?.tags ?? [];
// → ['active', 'completed', 'failed', 'side-quest', 'main-quest']
```

**Rule of thumb:**
- `getPinTaxonomy` → tag chip pickers, toolbar tag selectors, any UI scoped to one type.
- `getPinTaxonomyChoices` → global autocomplete, free-form tag inputs where showing all known tags is helpful.

---

## 10. Player Visibility vs Ownership

These are independent fields that control pin visibility for different reasons:

| Field | What it controls | Who sets it |
|-------|-----------------|-------------|
| `ownership.default` | Whether players can *see* the pin at all (based on document permission levels) | GM, in Configure Pin > Permissions |
| `config.blacksmithVisibility` | Whether the pin is *shown on the map* right now (`'visible'` / `'hidden'`) | GM, in Configure Pin > Permissions or Browse view |

A pin can have `ownership.default = OBSERVER` (players can see it) but `blacksmithVisibility = 'hidden'` (hidden from the map). This lets the GM keep a pin "ready but not yet revealed."

```javascript
const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

// Create a pin that is configured for players but hidden until the GM reveals it
await pins.create({
    moduleId: 'coffee-pub-squire',
    type: 'quest-pin',
    tags: ['main-quest'],
    text: 'The Hidden Lair',
    ownership: { default: OBSERVER },          // players CAN see it when visible
    config: { blacksmithVisibility: 'hidden' }, // but it is hidden from the map now
    sceneId: canvas.scene.id,
    x: 1400, y: 900
});

// Reveal it later
await pins.update(pinId, {
    config: { ...existingPin.config, blacksmithVisibility: 'visible' }
});
```

---

## Quick checklist

- [ ] `registerPinTaxonomy` called in `ready` with all your pin types and their tags
- [ ] All `pins.create()` calls include `type` and at least one entry in `tags`
- [ ] All `group` references removed from create/update/filter code
- [ ] Taxonomy JSON updated to v3 format if you ship one
- [ ] Ownership set explicitly (`NONE` for GM-only, `OBSERVER` for player-visible)
- [ ] `size.w` and `size.h` set independently if you want non-square pins
