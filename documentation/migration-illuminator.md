# Migration: Image Replacement → Illuminator (`coffee-pub-illuminator`)

**Purpose:** Extract image replacement, dead tokens, and related features from Blacksmith into a new optional module **Illuminator**. Blacksmith becomes the host that provides menubar/toolbar APIs and builds the menubar/combat context menu; Illuminator owns all image-replacement logic and exposes an API so Blacksmith can add “Replace Image” (and related items) to that menu only when Illuminator is installed.

**References:**
- **documentation/extraction-reassessment.md** — Section 3 (Illuminator scope, API contract, pattern).
- **documentation/architecture-imagereplacement.md** — Current architecture (will move to Illuminator repo or become Illuminator-only doc).
- **documentation/registering-with-blacksmith.md** — How optional modules get API at `ready` and register tools.

**Local development setup:** Illuminator lives as a folder under Blacksmith (`coffee-pub-blacksmith/coffee-pub-illuminator`). So Foundry loads it as a top-level module, create a directory junction in the Foundry modules folder:  
`mklink /J "…\Data\modules\coffee-pub-illuminator" "…\Data\modules\coffee-pub-blacksmith\coffee-pub-illuminator"`  
(Symbolic links require Administrator or Developer Mode on Windows; a junction works without elevation.)

---

## Functionality migrated (summary and clarification)

| Functionality | Migrates to Illuminator? | Notes |
|---------------|---------------------------|--------|
| **Replace token/portrait images** | ✅ Yes | Manual replacement window, token + portrait modes, apply/scan/cache. Core of Illuminator. |
| **Image replacement API** (register/unregister context menu items on image tiles) | ✅ Yes | Today `module.api.imageReplacement` on Blacksmith; after migration Illuminator exposes `registerImageTileContextMenuItem` / `unregisterImageTileContextMenuItem` on its own API. |
| **Update dropped** | ✅ Yes | Settings `tokenImageReplacementUpdateDropped` and `portraitImageReplacementUpdateDropped`; auto-update token/portrait when tokens are created on canvas. Lives in TokenImageReplacementWindow / ImageCacheManager flow. |
| **Loot pile image support** | ✅ Yes (image + Item Piles conversion) | Applying the loot pile image (`tokenLootPileImage`) and calling Item Piles’ `turnTokensIntoItemPiles` is in `TokenImageUtilities._convertTokenToLoot` → Illuminator. |
| **Adding inventory to the token (roll tables, add items/coins)** | ❌ Stays in Blacksmith | **Decision:** Keep in core. `CanvasTools._rollLootTable` and `_addRandomCoins` stay in **manager-canvas.js**. Blacksmith exposes a small API (e.g. roll loot for actor / add loot to actor) that Illuminator calls when converting dead to loot. Illuminator then does loot pile image + Item Piles conversion. | **Currently:** `CanvasTools._rollLootTable` and `_addRandomCoins` live in **manager-canvas.js** (Blacksmith). They are **only** called from `TokenImageUtilities._convertTokenToLoot`. So either: (A) move them to Illuminator so all “convert dead → loot” is in one module, or (B) keep them in Blacksmith as a small “roll loot for actor” API that Illuminator calls when converting to loot—so “adding inventory” stays core. |
| **Convert dead** | ✅ Yes | Dead token image swap at 0 HP, creature-type filter, PC vs NPC paths, death-save handling, sounds. All in `TokenImageUtilities` + settings → Illuminator. |
| **Convert dead → loot** (schedule after delay, then convert) | ✅ Yes (orchestration + image + Item Piles) | Scheduling, calling `_convertTokenToLoot`, loot image, Item Piles conversion → Illuminator. If we keep “add inventory” in Blacksmith (option B above), Illuminator would call Blacksmith API to roll tables/add coins, then do image + Item Piles. |
| **Cache and matching** | ✅ Yes | ImageCacheManager, manager-image-matching.js, scan/cache/tags/weights/threshold/fuzzy search, path settings → Illuminator. |
| **Supporting bits** | ✅ Yes | Path helpers (`getTokenImagePaths`, `getPortraitImagePaths`), all token/portrait replacement and dead/loot settings, lang, window template/styles, menubar/toolbar registration for “Replace Image”, combat context menu item (via API). |

**Decision (loot inventory):** Roll tables + add items/coins stay in Blacksmith; Illuminator calls Blacksmith API when converting dead to loot. See Section 2.1 "Loot inventory stays in Blacksmith."

**Loot Pile / inventory split (to decide):**  
- **Loot pile image** + **Item Piles “turn into pile”**: in Illuminator (part of TokenImageUtilities).  
- **Rolling loot tables and adding items/coins to the actor**: only used by convert-dead-to-loot; lives in **manager-canvas.js**. Decide: move to Illuminator (A) or keep in Blacksmith as API for “add loot to actor” (B).

---

## 1. Illuminator API contract

Illuminator exposes an API on `game.modules.get('coffee-pub-illuminator')?.api` when the module is active. Blacksmith (and other consumers) must **check for the module and API** before using it; if absent, skip image-replacement UI—no errors, no placeholders.

### 1.1 Context menu items for menubar/combat area

Blacksmith builds a context menu for the combat/portrait area (e.g. right-click on combatant) that currently includes a hardcoded “Replace Image” item. After migration, Blacksmith must **pull** these items from Illuminator.

**Illuminator exposes:**

| Method | Signature | Purpose |
|--------|------------|--------|
| `getCombatContextMenuItems(context)` | `(context: { combat, combatantId, canvasToken?, x, y }) => Array<{ name, icon, disabled?, callback }>` | Returns menu items to inject into the combat/portrait context menu (e.g. “Replace Image”). Blacksmith calls this when building that menu; if Illuminator is not installed or API is missing, Blacksmith adds no such items. |

**Context** can include whatever Illuminator needs (e.g. `combat`, `combatantId`, `canvasToken`, `x`, `y`) so that “Replace Image” can pan/select and open the window with the correct token.

**Blacksmith behavior:** When building the combat context menu (e.g. in `api-menubar.js` ~4493–4515), replace the hardcoded “Replace Image” block with:

1. Check `game.modules.get('coffee-pub-illuminator')?.active` and presence of `api.getCombatContextMenuItems`.
2. If present, call `api.getCombatContextMenuItems(context)` and push each returned item into `gmItems` (or the appropriate array).
3. If not present, add nothing.

### 1.2 Image-tile context menu (inside replacement window)

Other modules may want to add items to the **image-tile** context menu inside the token/portrait replacement window (e.g. “Add to Favorites” is built-in; third-party could add “Export to…”). Today Blacksmith exposes `module.api.imageReplacement.registerContextMenuItem` / `unregisterContextMenuItem` which delegate to `ImageCacheManager`. After migration, **Illuminator** owns that API.

**Illuminator exposes:**

| Method | Purpose |
|--------|--------|
| `registerImageTileContextMenuItem(itemId, itemData)` | Same contract as current `ImageCacheManager.registerImageTileContextMenuItem`. |
| `unregisterImageTileContextMenuItem(itemId)` | Same contract as current `ImageCacheManager.unregisterImageTileContextMenuItem`. |

Optional: Illuminator can document this as “for other modules that want to extend the image-tile context menu.” Blacksmith no longer exposes `imageReplacement` on its API.

### 1.3 Open window (optional)

If any code outside Illuminator needs to open the replacement window programmatically, Illuminator can expose:

| Method | Purpose |
|--------|--------|
| `openReplacementWindow(options?)` | Opens the token/portrait replacement window (e.g. `TokenImageReplacementWindow.openWindow()`). Optional; menubar/toolbar and context menu callbacks can live inside Illuminator and call the window directly. |

---

## 2. Blacksmith changes

### 2.1 Remove from Blacksmith

- **Scripts:** Do not move; **delete** or stop loading after code is moved to Illuminator. Illuminator will have its own copies.
  - `scripts/manager-image-cache.js`
  - `scripts/manager-image-matching.js`
  - `scripts/token-image-replacement.js`
  - `scripts/token-image-utilities.js`
- **Templates:** `templates/window-token-replacement.hbs` → move to Illuminator (path becomes e.g. `modules/coffee-pub-illuminator/templates/...`).
- **Styles:** `styles/window-token-replacement.css` → move to Illuminator. Remove `@import "window-token-replacement.css"` from `styles/default.css`.
- **Settings:** All image-replacement and dead-token settings (see **Section 4** for keys) → move registration and defaults to Illuminator. Remove from `scripts/settings.js`.
- **Lang:** All keys used by image replacement / dead tokens → move to Illuminator’s lang files.
- **API:** Remove `module.api.imageReplacement` from `scripts/blacksmith.js` (Illuminator exposes its own).
- **Menubar:** Remove registration of menubar tool `'imagereplace'` (e.g. `api-menubar.js` ~1255–1262). Illuminator will register it via `registerMenubarTool`.
- **Toolbar:** Remove registration of toolbar tool `'token-replacement'` (e.g. `manager-toolbar.js` ~255–271). Illuminator will register it via `registerToolbarTool`.
- **Combat context menu:** Remove the hardcoded “Replace Image” block (`api-menubar.js` ~4501–4515). Replace with “pull from Illuminator API when available” (see **Section 1.1**).
- **Init:** Remove any `ImageCacheManager.initialize()`, `TokenImageUtilities.initialize()` (or equivalent) from Blacksmith bootstrap/ready. Illuminator runs these in its own `ready` hook.
- **Imports:** Remove imports of `ImageCacheManager`, `TokenImageReplacementWindow`, `TokenImageUtilities`, `ImageMatching` (and any image-replacement-only helpers) from Blacksmith scripts. The only remaining reference to Illuminator in Blacksmith is the **context menu** call: `game.modules.get('coffee-pub-illuminator')?.api?.getCombatContextMenuItems(...)`.

**Loot inventory stays in Blacksmith:** Roll tables and add items/coins to the actor remain in **manager-canvas.js** (`CanvasTools._rollLootTable`, `_addRandomCoins`). Blacksmith exposes an API (e.g. `addLootToActor(actor, options)` or `rollLootForActor(actor, options)`) so Illuminator’s convert-dead-to-loot flow can call it to add loot; Illuminator then applies the loot pile image and calls Item Piles. Do not move `_rollLootTable` / `_addRandomCoins` to Illuminator.

### 2.2 Path helpers (`getTokenImagePaths`, `getPortraitImagePaths`)

Currently in `scripts/settings.js`. **Decision:** Either move to Illuminator (Illuminator’s settings module) or leave in Blacksmith as a small shared helper if other systems ever need path listing. Migration doc recommends **move to Illuminator** so Blacksmith has zero image-path logic. If something in core later needs paths, Blacksmith can add a minimal helper or call into Illuminator’s API.

### 2.3 Documentation

- **documentation/architecture-imagereplacement.md** — Move to Illuminator repo or copy; update paths and module IDs to Illuminator. Blacksmith can link to “see Coffee Pub Illuminator” for image replacement architecture.
- **documentation/architecture-blacksmith.md** — Remove or update the “Token/portrait image replacement” bullet and table row to state that this is provided by Illuminator when installed.

---

## 3. Illuminator module creation

### 3.1 Repo and manifest

- New module **coffee-pub-illuminator** (id: `coffee-pub-illuminator`).
- **module.json:** Same pattern as Herald — `esm` entry, scripts, styles, templates, lang; dependency on `coffee-pub-blacksmith` (e.g. `"relationships": { "requires": [{ "id": "coffee-pub-blacksmith", "type": "module" }] }`).
- **Compatibility:** Foundry v13+, D&D 5e 5.5+ to match Blacksmith.

### 3.2 Scripts to add (moved from Blacksmith)

| Script (in Illuminator) | Origin |
|-------------------------|--------|
| `scripts/manager-image-cache.js` | From Blacksmith `scripts/manager-image-cache.js` — update `MODULE.ID` / paths to `coffee-pub-illuminator` and template paths to `modules/coffee-pub-illuminator/templates/...`. |
| `scripts/manager-image-matching.js` | From Blacksmith `scripts/manager-image-matching.js` — update module references. |
| `scripts/token-image-replacement.js` | From Blacksmith — template path, `getTokenImagePaths`/`getPortraitImagePaths` from Illuminator settings, `MODULE.ID` for settings. |
| `scripts/token-image-utilities.js` | From Blacksmith — `ImageCacheManager` import path; HookManager from Blacksmith API or duplicate if needed (prefer Blacksmith if exposed). |
| `scripts/settings.js` (or equivalent) | Register all image-replacement and dead-token settings; implement `getTokenImagePaths`, `getPortraitImagePaths` using Illuminator’s settings. |
| `scripts/illuminator.js` (or main entry) | On `Hooks.once('ready', ...)`: get `game.modules.get('coffee-pub-blacksmith')?.api`, run `ImageCacheManager.initialize()`, `TokenImageUtilities.initialize()`, register menubar tool `'imagereplace'`, toolbar tool `'token-replacement'`, expose `module.api` with `getCombatContextMenuItems`, `registerImageTileContextMenuItem`, `unregisterImageTileContextMenuItem`, and optionally `openReplacementWindow`. |

### 3.3 Templates and styles

- **templates/window-token-replacement.hbs** — Copy from Blacksmith; update any asset paths to `modules/coffee-pub-illuminator/...` if needed.
- **styles/window-token-replacement.css** — Copy from Blacksmith; ensure class names remain the same so the template still works.

### 3.4 Lang

- Copy all lang keys used by image replacement and dead-token settings/window from Blacksmith into Illuminator’s `lang/en.json` (and others). Keys can stay the same or be namespaced (e.g. `coffee-pub-illuminator.tokenImageReplacementEnabled-Label`).

### 3.5 Init and registration order

1. **init:** Illuminator loads scripts; no dependency on Blacksmith at load time (only at `ready`).
2. **ready:**  
   - `blacksmith = game.modules.get('coffee-pub-blacksmith')?.api`; if missing, log and skip registration.  
   - `ImageCacheManager.initialize()` (and any TokenImageUtilities init).  
   - Register menubar tool with `blacksmith.registerMenubarTool('imagereplace', { ... })` (same config as current Blacksmith, but tool handler opens `TokenImageReplacementWindow.openWindow()` from Illuminator).  
   - Register toolbar tool with `blacksmith.registerToolbarTool('token-replacement', { ... })`.  
   - Set `module.api = { getCombatContextMenuItems, registerImageTileContextMenuItem, unregisterImageTileContextMenuItem, openReplacementWindow }`.
3. **unload:** Unregister menubar/toolbar tools, run TokenImageUtilities/ImageCacheManager cleanup if any, clear `module.api`.

---

## 4. Settings and lang inventory (Blacksmith → Illuminator)

### 4.1 Settings keys to move

- **Dead token:** `deadTokenImagePath`, `deadTokenImagePathPC`
- **Token image replacement paths:** `tokenImageReplacementPath1`…`tokenImageReplacementPathN` (dynamic)
- **Portrait image replacement paths:** `portraitImageReplacementPath1`…`portraitImageReplacementPathN` (dynamic)
- **Display:** `tokenImageReplacementDisplayCacheStatus`
- **Toolbar visibility:** `tokenImageReplacementShowInCoffeePubToolbar`, `tokenImageReplacementShowInFoundryToolbar`
- **UI behavior:** `tokenImageReplacementCategoryStyle`, `tokenImageReplacementTagSortMode`, `tokenImageReplacementLastMode`
- **Weights:** `tokenImageReplacementMonsterMapping`, `tokenImageReplacementWeightActorName`, `tokenImageReplacementWeightTokenName`, `tokenImageReplacementWeightRepresentedActor`, `tokenImageReplacementWeightCreatureType`, `tokenImageReplacementWeightCreatureSubtype`, `tokenImageReplacementWeightEquipment`, `tokenImageReplacementWeightSize`, `tokenImageReplacementWeightTags`
- **Ignored/filters:** `tokenImageReplacementIgnoredFolders`, `tokenImageReplacementDeprioritizedWords`, `tokenImageReplacementIgnoredWords`, `tokenImageReplacementIgnoredTagPatterns`, `tokenImageReplacementFilterGarbageTags`
- **Behavior:** `tokenImageReplacementEnabled`, `tokenImageReplacementUpdateDropped`, `tokenImageReplacementThreshold`, `tokenImageReplacementFuzzySearch`, `tokenImageReplacementVariability`, `tokenImageReplacementUpdateMonsters`, `tokenImageReplacementUpdateNPCs`, `tokenImageReplacementUpdateVehicles`
- **Token image fit mode:** `setTokenImageFitMode` (if only used by image replacement; otherwise leave in Blacksmith)

Search Blacksmith `settings.js` for `tokenImageReplacement`, `portraitImageReplacement`, `deadTokenImage`, `TokenImage`, `ImageReplacement` to capture every key. Move the **entire** registration block for each to Illuminator and remove from Blacksmith.

### 4.2 Lang keys

Grep Blacksmith lang files for the setting key names above (e.g. `-Label`, `-Hint`) and for strings used in `window-token-replacement.hbs` and token-image-replacement/utilities. Move those entries to Illuminator lang.

---

## 5. Step-by-step migration checklist

Use this order to avoid broken references.

| Step | Task | Owner |
|------|------|--------|
| 1 | Create Illuminator repo: `module.json`, directory structure (scripts, templates, styles, lang). | Illuminator |
| 2 | Copy and adapt settings and path helpers into Illuminator (getTokenImagePaths, getPortraitImagePaths, all image-replacement and dead-token setting registrations). | Illuminator |
| 3 | Copy lang entries for image replacement and dead tokens into Illuminator lang. | Illuminator |
| 4 | Copy manager-image-cache.js, manager-image-matching.js, token-image-replacement.js, token-image-utilities.js into Illuminator; update MODULE.ID, template paths, and setting/getter imports to Illuminator. | Illuminator |
| 5 | Copy window-token-replacement.hbs and window-token-replacement.css into Illuminator; fix asset paths if any. | Illuminator |
| 6 | Implement Illuminator main entry: ready hook gets Blacksmith API, runs ImageCacheManager and TokenImageUtilities init, registers menubar and toolbar tools, exposes api.getCombatContextMenuItems (and others). Implement getCombatContextMenuItems to return the “Replace Image” item (same behavior as current Blacksmith block). | Illuminator |
| 7 | In Blacksmith: Refactor combat context menu to call `game.modules.get('coffee-pub-illuminator')?.api?.getCombatContextMenuItems(context)` and append returned items to gmItems; remove hardcoded “Replace Image” block. | Blacksmith |
| 8 | In Blacksmith: Remove menubar registration of `'imagereplace'` and toolbar registration of `'token-replacement'`. | Blacksmith |
| 9 | In Blacksmith: Remove module.api.imageReplacement; remove init of ImageCacheManager and TokenImageUtilities; remove imports and any remaining references to moved code. | Blacksmith |
| 10 | In Blacksmith: Remove or relocate image-replacement and dead-token settings and lang; remove templates/styles and default.css import. | Blacksmith |
| 11 | In Blacksmith: Delete (or stop loading) manager-image-cache.js, manager-image-matching.js, token-image-replacement.js, token-image-utilities.js. | Blacksmith |
| 12 | Update documentation: architecture-blacksmith.md, architecture-imagereplacement.md (move or link to Illuminator). | Both |
| 13 | CHANGELOG entries: Blacksmith “Image replacement moved to Coffee Pub Illuminator”; Illuminator “Initial release (extracted from Blacksmith).” | Both |

---

## 6. Testing and verification

- **Illuminator installed:** Replace Image appears in menubar, toolbar, and combat context menu; window opens; settings and cache work; other modules can register image-tile context menu items via Illuminator API.
- **Illuminator not installed:** No “Replace Image” in combat context menu; no menubar/toolbar image-replacement tools; no errors in console; Blacksmith core and other features unaffected.
- **Unload Illuminator:** Tools disappear; context menu no longer shows Replace Image; no leftover handlers or references in Blacksmith.

---

## 7. Summary

| Item | Location |
|------|----------|
| **API for combat context menu** | Illuminator exposes `getCombatContextMenuItems(context)`; Blacksmith calls it when building the menu and adds returned items only if Illuminator is active. |
| **API for image-tile context menu** | Illuminator exposes `registerImageTileContextMenuItem` / `unregisterImageTileContextMenuItem` (moved from Blacksmith’s imageReplacement API). |
| **Menubar/toolbar tools** | Registered by Illuminator via Blacksmith’s `registerMenubarTool` / `registerToolbarTool`. |
| **All feature code, settings, lang, templates, styles** | Live in Illuminator; Blacksmith removes them and has no image-replacement logic beyond “ask Illuminator for context menu items.” |

This document is the single migration plan for the Illuminator extraction. Update it as the work progresses (e.g. checkbox the steps or add “Done” and date).
