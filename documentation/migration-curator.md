# Migration: Image Replacement â†’ Curator (`coffee-pub-curator`)

**Purpose:** Extract image replacement, dead tokens, and related features from Blacksmith into a new optional module **Curator**. Blacksmith becomes the host that provides menubar/toolbar APIs and builds the menubar/combat context menu; Curator owns all image-replacement logic and exposes an API so Blacksmith can add â€œReplace Imageâ€ (and related items) to that menu only when Curator is installed.

**References:**
- **documentation/extraction-reassessment.md** â€” Section 3 (Curator scope, API contract, pattern).
- **documentation/architecture-imagereplacement.md** â€” Current architecture (will move to Curator repo or become Curator-only doc).
- **documentation/registering-with-blacksmith.md** â€” How optional modules get API at `ready` and register tools.

**Local development setup:** Curator lives as a folder under Blacksmith (`coffee-pub-blacksmith/coffee-pub-curator`). So Foundry loads it as a top-level module, create a directory junction in the Foundry modules folder:  
`mklink /J "â€¦\Data\modules\coffee-pub-curator" "â€¦\Data\modules\coffee-pub-blacksmith\coffee-pub-curator"`  
(Symbolic links require Administrator or Developer Mode on Windows; a junction works without elevation.)

---

## Functionality migrated (summary and clarification)

| Functionality | Migrates to Curator? | Notes |
|---------------|---------------------------|--------|
| **Replace token/portrait images** | âœ… Yes | Manual replacement window, token + portrait modes, apply/scan/cache. Core of Curator. |
| **Image replacement API** (register/unregister context menu items on image tiles) | âœ… Yes | Today `module.api.imageReplacement` on Blacksmith; after migration Curator exposes `registerImageTileContextMenuItem` / `unregisterImageTileContextMenuItem` on its own API. |
| **Update dropped** | âœ… Yes | Settings `tokenImageReplacementUpdateDropped` and `portraitImageReplacementUpdateDropped`; auto-update token/portrait when tokens are created on canvas. Lives in TokenImageReplacementWindow / ImageCacheManager flow. |
| **Loot pile image support** | âœ… Yes (image + Item Piles conversion) | Applying the loot pile image (`tokenLootPileImage`) and calling Item Pilesâ€™ `turnTokensIntoItemPiles` is in `TokenImageUtilities._convertTokenToLoot` â†’ Curator. |
| **Adding inventory to the token (roll tables, add items/coins)** | âŒ Stays in Blacksmith | **Decision:** Keep in core. `CanvasTools._rollLootTable` and `_addRandomCoins` stay in **manager-canvas.js**. Blacksmith exposes a small API (e.g. roll loot for actor / add loot to actor) that Curator calls when converting dead to loot. Curator then does loot pile image + Item Piles conversion. | **Currently:** `CanvasTools._rollLootTable` and `_addRandomCoins` live in **manager-canvas.js** (Blacksmith). They are **only** called from `TokenImageUtilities._convertTokenToLoot`. So either: (A) move them to Curator so all â€œconvert dead â†’ lootâ€ is in one module, or (B) keep them in Blacksmith as a small â€œroll loot for actorâ€ API that Curator calls when converting to lootâ€”so â€œadding inventoryâ€ stays core. |
| **Convert dead** | âœ… Yes | Dead token image swap at 0 HP, creature-type filter, PC vs NPC paths, death-save handling, sounds. All in `TokenImageUtilities` + settings â†’ Curator. |
| **Convert dead â†’ loot** (schedule after delay, then convert) | âœ… Yes (orchestration + image + Item Piles) | Scheduling, calling `_convertTokenToLoot`, loot image, Item Piles conversion â†’ Curator. If we keep â€œadd inventoryâ€ in Blacksmith (option B above), Curator would call Blacksmith API to roll tables/add coins, then do image + Item Piles. |
| **Cache and matching** | âœ… Yes | ImageCacheManager, manager-image-matching.js, scan/cache/tags/weights/threshold/fuzzy search, path settings â†’ Curator. |
| **Supporting bits** | âœ… Yes | Path helpers (`getTokenImagePaths`, `getPortraitImagePaths`), all token/portrait replacement and dead/loot settings, lang, window template/styles, menubar/toolbar registration for â€œReplace Imageâ€, combat context menu item (via API). |

**Decision (loot inventory):** Roll tables + add items/coins stay in Blacksmith; Curator calls Blacksmith API when converting dead to loot. See Section 2.1 "Loot inventory stays in Blacksmith."

**Loot Pile / inventory split (to decide):**  
- **Loot pile image** + **Item Piles â€œturn into pileâ€**: in Curator (part of TokenImageUtilities).  
- **Rolling loot tables and adding items/coins to the actor**: only used by convert-dead-to-loot; lives in **manager-canvas.js**. Decide: move to Curator (A) or keep in Blacksmith as API for â€œadd loot to actorâ€ (B).

---

## 1. Curator API contract

Curator exposes an API on `game.modules.get('coffee-pub-curator')?.api` when the module is active. Blacksmith (and other consumers) must **check for the module and API** before using it; if absent, skip image-replacement UIâ€”no errors, no placeholders.

### 1.1 Context menu items for menubar/combat area

Blacksmith builds a context menu for the combat/portrait area (e.g. right-click on combatant) that currently includes a hardcoded â€œReplace Imageâ€ item. After migration, Blacksmith must **pull** these items from Curator.

**Curator exposes:**

| Method | Signature | Purpose |
|--------|------------|--------|
| `getCombatContextMenuItems(context)` | `(context: { combat, combatantId, canvasToken?, x, y }) => Array<{ name, icon, disabled?, callback }>` | Returns menu items to inject into the combat/portrait context menu (e.g. â€œReplace Imageâ€). Blacksmith calls this when building that menu; if Curator is not installed or API is missing, Blacksmith adds no such items. |

**Context** can include whatever Curator needs (e.g. `combat`, `combatantId`, `canvasToken`, `x`, `y`) so that â€œReplace Imageâ€ can pan/select and open the window with the correct token.

**Blacksmith behavior:** When building the combat context menu (e.g. in `api-menubar.js` ~4493â€“4515), replace the hardcoded â€œReplace Imageâ€ block with:

1. Check `game.modules.get('coffee-pub-curator')?.active` and presence of `api.getCombatContextMenuItems`.
2. If present, call `api.getCombatContextMenuItems(context)` and push each returned item into `gmItems` (or the appropriate array).
3. If not present, add nothing.

### 1.2 Image-tile context menu (inside replacement window)

Other modules may want to add items to the **image-tile** context menu inside the token/portrait replacement window (e.g. â€œAdd to Favoritesâ€ is built-in; third-party could add â€œExport toâ€¦â€). Today Blacksmith exposes `module.api.imageReplacement.registerContextMenuItem` / `unregisterContextMenuItem` which delegate to `ImageCacheManager`. After migration, **Curator** owns that API.

**Curator exposes:**

| Method | Purpose |
|--------|--------|
| `registerImageTileContextMenuItem(itemId, itemData)` | Same contract as current `ImageCacheManager.registerImageTileContextMenuItem`. |
| `unregisterImageTileContextMenuItem(itemId)` | Same contract as current `ImageCacheManager.unregisterImageTileContextMenuItem`. |

Optional: Curator can document this as â€œfor other modules that want to extend the image-tile context menu.â€ Blacksmith no longer exposes `imageReplacement` on its API.

### 1.3 Open window (optional)

If any code outside Curator needs to open the replacement window programmatically, Curator can expose:

| Method | Purpose |
|--------|--------|
| `openReplacementWindow(options?)` | Opens the token/portrait replacement window (e.g. `TokenImageReplacementWindow.openWindow()`). Optional; menubar/toolbar and context menu callbacks can live inside Curator and call the window directly. |

---

## 2. Blacksmith changes

### 2.1 Remove from Blacksmith

- **Scripts:** Do not move; **delete** or stop loading after code is moved to Curator. Curator will have its own copies.
  - `scripts/manager-image-cache.js`
  - `scripts/manager-image-matching.js`
  - `scripts/token-image-replacement.js`
  - `scripts/token-image-utilities.js`
- **Templates:** `templates/window-token-replacement.hbs` â†’ move to Curator (path becomes e.g. `modules/coffee-pub-curator/templates/...`).
- **Styles:** `styles/window-token-replacement.css` â†’ move to Curator. Remove `@import "window-token-replacement.css"` from `styles/default.css`.
- **Settings:** All image-replacement and dead-token settings (see **Section 4** for keys) â†’ move registration and defaults to Curator. Remove from `scripts/settings.js`.
- **Lang:** All keys used by image replacement / dead tokens â†’ move to Curatorâ€™s lang files.
- **API:** Remove `module.api.imageReplacement` from `scripts/blacksmith.js` (Curator exposes its own).
- **Menubar:** Remove registration of menubar tool `'imagereplace'` (e.g. `api-menubar.js` ~1255â€“1262). Curator will register it via `registerMenubarTool`.
- **Toolbar:** Remove registration of toolbar tool `'token-replacement'` (e.g. `manager-toolbar.js` ~255â€“271). Curator will register it via `registerToolbarTool`.
- **Combat context menu:** Remove the hardcoded â€œReplace Imageâ€ block (`api-menubar.js` ~4501â€“4515). Replace with â€œpull from Curator API when availableâ€ (see **Section 1.1**).
- **Init:** Remove any `ImageCacheManager.initialize()`, `TokenImageUtilities.initialize()` (or equivalent) from Blacksmith bootstrap/ready. Curator runs these in its own `ready` hook.
- **Imports:** Remove imports of `ImageCacheManager`, `TokenImageReplacementWindow`, `TokenImageUtilities`, `ImageMatching` (and any image-replacement-only helpers) from Blacksmith scripts. The only remaining reference to Curator in Blacksmith is the **context menu** call: `game.modules.get('coffee-pub-curator')?.api?.getCombatContextMenuItems(...)`.

**Loot inventory stays in Blacksmith:** Roll tables and add items/coins to the actor remain in **manager-canvas.js** (`CanvasTools._rollLootTable`, `_addRandomCoins`). Blacksmith exposes an API (e.g. `addLootToActor(actor, options)` or `rollLootForActor(actor, options)`) so Curatorâ€™s convert-dead-to-loot flow can call it to add loot; Curator then applies the loot pile image and calls Item Piles. Do not move `_rollLootTable` / `_addRandomCoins` to Curator.

### 2.2 Path helpers (`getTokenImagePaths`, `getPortraitImagePaths`)

Currently in `scripts/settings.js`. **Decision:** Either move to Curator (Curatorâ€™s settings module) or leave in Blacksmith as a small shared helper if other systems ever need path listing. Migration doc recommends **move to Curator** so Blacksmith has zero image-path logic. If something in core later needs paths, Blacksmith can add a minimal helper or call into Curatorâ€™s API.

### 2.3 Documentation

- **documentation/architecture-imagereplacement.md** â€” Move to Curator repo or copy; update paths and module IDs to Curator. Blacksmith can link to â€œsee Coffee Pub Curatorâ€ for image replacement architecture.
- **documentation/architecture-blacksmith.md** â€” Remove or update the â€œToken/portrait image replacementâ€ bullet and table row to state that this is provided by Curator when installed.

---

## 3. Curator module creation

### 3.1 Repo and manifest

- New module **coffee-pub-curator** (id: `coffee-pub-curator`).
- **module.json:** Same pattern as Herald â€” `esm` entry, scripts, styles, templates, lang; dependency on `coffee-pub-blacksmith` (e.g. `"relationships": { "requires": [{ "id": "coffee-pub-blacksmith", "type": "module" }] }`).
- **Compatibility:** Foundry v13+, D&D 5e 5.5+ to match Blacksmith.

### 3.2 Scripts to add (moved from Blacksmith)

| Script (in Curator) | Origin |
|-------------------------|--------|
| `scripts/manager-image-cache.js` | From Blacksmith `scripts/manager-image-cache.js` â€” update `MODULE.ID` / paths to `coffee-pub-curator` and template paths to `modules/coffee-pub-curator/templates/...`. |
| `scripts/manager-image-matching.js` | From Blacksmith `scripts/manager-image-matching.js` â€” update module references. |
| `scripts/token-image-replacement.js` | From Blacksmith â€” template path, `getTokenImagePaths`/`getPortraitImagePaths` from Curator settings, `MODULE.ID` for settings. |
| `scripts/token-image-utilities.js` | From Blacksmith â€” `ImageCacheManager` import path; HookManager from Blacksmith API or duplicate if needed (prefer Blacksmith if exposed). |
| `scripts/settings.js` (or equivalent) | Register all image-replacement and dead-token settings; implement `getTokenImagePaths`, `getPortraitImagePaths` using Curatorâ€™s settings. |
| `scripts/curator.js` (or main entry) | On `Hooks.once('ready', ...)`: get `game.modules.get('coffee-pub-blacksmith')?.api`, run `ImageCacheManager.initialize()`, `TokenImageUtilities.initialize()`, register menubar tool `'imagereplace'`, toolbar tool `'token-replacement'`, expose `module.api` with `getCombatContextMenuItems`, `registerImageTileContextMenuItem`, `unregisterImageTileContextMenuItem`, and optionally `openReplacementWindow`. |

### 3.3 Templates and styles

- **templates/window-token-replacement.hbs** â€” Copy from Blacksmith; update any asset paths to `modules/coffee-pub-curator/...` if needed.
- **styles/window-token-replacement.css** â€” Copy from Blacksmith; ensure class names remain the same so the template still works.

### 3.4 Lang

- Copy all lang keys used by image replacement and dead-token settings/window from Blacksmith into Curatorâ€™s `lang/en.json` (and others). Keys can stay the same or be namespaced (e.g. `coffee-pub-curator.tokenImageReplacementEnabled-Label`).

### 3.5 Init and registration order

1. **init:** Curator loads scripts; no dependency on Blacksmith at load time (only at `ready`).
2. **ready:**  
   - `blacksmith = game.modules.get('coffee-pub-blacksmith')?.api`; if missing, log and skip registration.  
   - `ImageCacheManager.initialize()` (and any TokenImageUtilities init).  
   - Register menubar tool with `blacksmith.registerMenubarTool('imagereplace', { ... })` (same config as current Blacksmith, but tool handler opens `TokenImageReplacementWindow.openWindow()` from Curator).  
   - Register toolbar tool with `blacksmith.registerToolbarTool('token-replacement', { ... })`.  
   - Set `module.api = { getCombatContextMenuItems, registerImageTileContextMenuItem, unregisterImageTileContextMenuItem, openReplacementWindow }`.
3. **unload:** Unregister menubar/toolbar tools, run TokenImageUtilities/ImageCacheManager cleanup if any, clear `module.api`.

---

## 4. Settings and lang inventory (Blacksmith â†’ Curator)

### 4.1 Settings keys to move

- **Dead token:** `deadTokenImagePath`, `deadTokenImagePathPC`
- **Token image replacement paths:** `tokenImageReplacementPath1`â€¦`tokenImageReplacementPathN` (dynamic)
- **Portrait image replacement paths:** `portraitImageReplacementPath1`â€¦`portraitImageReplacementPathN` (dynamic)
- **Display:** `tokenImageReplacementDisplayCacheStatus`
- **Toolbar visibility:** `tokenImageReplacementShowInCoffeePubToolbar`, `tokenImageReplacementShowInFoundryToolbar`
- **UI behavior:** `tokenImageReplacementCategoryStyle`, `tokenImageReplacementTagSortMode`, `tokenImageReplacementLastMode`
- **Weights:** `tokenImageReplacementMonsterMapping`, `tokenImageReplacementWeightActorName`, `tokenImageReplacementWeightTokenName`, `tokenImageReplacementWeightRepresentedActor`, `tokenImageReplacementWeightCreatureType`, `tokenImageReplacementWeightCreatureSubtype`, `tokenImageReplacementWeightEquipment`, `tokenImageReplacementWeightSize`, `tokenImageReplacementWeightTags`
- **Ignored/filters:** `tokenImageReplacementIgnoredFolders`, `tokenImageReplacementDeprioritizedWords`, `tokenImageReplacementIgnoredWords`, `tokenImageReplacementIgnoredTagPatterns`, `tokenImageReplacementFilterGarbageTags`
- **Behavior:** `tokenImageReplacementEnabled`, `tokenImageReplacementUpdateDropped`, `tokenImageReplacementThreshold`, `tokenImageReplacementFuzzySearch`, `tokenImageReplacementVariability`, `tokenImageReplacementUpdateMonsters`, `tokenImageReplacementUpdateNPCs`, `tokenImageReplacementUpdateVehicles`
- **Token image fit mode:** `setTokenImageFitMode` (if only used by image replacement; otherwise leave in Blacksmith)

Search Blacksmith `settings.js` for `tokenImageReplacement`, `portraitImageReplacement`, `deadTokenImage`, `TokenImage`, `ImageReplacement` to capture every key. Move the **entire** registration block for each to Curator and remove from Blacksmith.

### 4.2 Lang keys

Grep Blacksmith lang files for the setting key names above (e.g. `-Label`, `-Hint`) and for strings used in `window-token-replacement.hbs` and token-image-replacement/utilities. Move those entries to Curator lang.

---

## 5. Step-by-step migration checklist

Use this order to avoid broken references.

| Step | Task | Owner |
|------|------|--------|
| 1 | Create Curator repo: `module.json`, directory structure (scripts, templates, styles, lang). | Curator |
| 2 | Copy and adapt settings and path helpers into Curator (getTokenImagePaths, getPortraitImagePaths, all image-replacement and dead-token setting registrations). | Curator |
| 3 | Copy lang entries for image replacement and dead tokens into Curator lang. | Curator |
| 4 | Copy manager-image-cache.js, manager-image-matching.js, token-image-replacement.js, token-image-utilities.js into Curator; update MODULE.ID, template paths, and setting/getter imports to Curator. | Curator |
| 5 | Copy window-token-replacement.hbs and window-token-replacement.css into Curator; fix asset paths if any. | Curator |
| 6 | Implement Curator main entry: ready hook gets Blacksmith API, runs ImageCacheManager and TokenImageUtilities init, registers menubar and toolbar tools, exposes api.getCombatContextMenuItems (and others). Implement getCombatContextMenuItems to return the â€œReplace Imageâ€ item (same behavior as current Blacksmith block). | Curator |
| 7 | In Blacksmith: Refactor combat context menu to call `game.modules.get('coffee-pub-curator')?.api?.getCombatContextMenuItems(context)` and append returned items to gmItems; remove hardcoded â€œReplace Imageâ€ block. | Blacksmith |
| 8 | In Blacksmith: Remove menubar registration of `'imagereplace'` and toolbar registration of `'token-replacement'`. | Blacksmith |
| 9 | In Blacksmith: Remove module.api.imageReplacement; remove init of ImageCacheManager and TokenImageUtilities; remove imports and any remaining references to moved code. | Blacksmith |
| 10 | In Blacksmith: Remove or relocate image-replacement and dead-token settings and lang; remove templates/styles and default.css import. | Blacksmith |
| 11 | In Blacksmith: Delete (or stop loading) manager-image-cache.js, manager-image-matching.js, token-image-replacement.js, token-image-utilities.js. | Blacksmith |
| 12 | Update documentation: architecture-blacksmith.md, architecture-imagereplacement.md (move or link to Curator). | Both |
| 13 | CHANGELOG entries: Blacksmith â€œImage replacement moved to Coffee Pub Curatorâ€; Curator â€œInitial release (extracted from Blacksmith).â€ | Both |

---

## 6. Testing and verification

- **Curator installed:** Replace Image appears in menubar, toolbar, and combat context menu; window opens; settings and cache work; other modules can register image-tile context menu items via Curator API.
- **Curator not installed:** No â€œReplace Imageâ€ in combat context menu; no menubar/toolbar image-replacement tools; no errors in console; Blacksmith core and other features unaffected.
- **Unload Curator:** Tools disappear; context menu no longer shows Replace Image; no leftover handlers or references in Blacksmith.

---

## 7. Summary

| Item | Location |
|------|----------|
| **API for combat context menu** | Curator exposes `getCombatContextMenuItems(context)`; Blacksmith calls it when building the menu and adds returned items only if Curator is active. |
| **API for image-tile context menu** | Curator exposes `registerImageTileContextMenuItem` / `unregisterImageTileContextMenuItem` (moved from Blacksmithâ€™s imageReplacement API). |
| **Menubar/toolbar tools** | Registered by Curator via Blacksmithâ€™s `registerMenubarTool` / `registerToolbarTool`. |
| **All feature code, settings, lang, templates, styles** | Live in Curator; Blacksmith removes them and has no image-replacement logic beyond â€œask Curator for context menu items.â€ |

This document is the single migration plan for the Curator extraction. Update it as the work progresses (e.g. checkbox the steps or add â€œDoneâ€ and date).
