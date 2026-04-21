# Pin API — Integration & Migration Guide

**Audience:** Developers of Coffee Pub modules (Squire, Artificer, Minstrel, etc.) integrating with the Blacksmith Pins API as of **v13.6.2**.

For the full method reference see [`api-pins.md`](../api/api-pins.md).

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

## Quick checklist

- [ ] `registerPinTaxonomy` called in `ready` with all your pin types and their tags
- [ ] All `pins.create()` calls include `type` and at least one entry in `tags`
- [ ] All `group` references removed from create/update/filter code
- [ ] Taxonomy JSON updated to v3 format if you ship one
- [ ] Ownership set explicitly (`NONE` for GM-only, `OBSERVER` for player-visible)
- [ ] `size.w` and `size.h` set independently if you want non-square pins
