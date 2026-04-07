# Asset manifests & “Asset Mapping” settings — plan

## Roadmap

Track progress here; update statuses as work lands.

| Phase | Deliverable | Status | Notes |
|-------|-------------|--------|-------|
| **1 — Split** | Bundled data split; shipped JSON defaults | **Done** | Authoring + runtime defaults: **`resources/asset-defaults/*.json`** only (fetched at load; **no** Node/build/sync bundle); listed in `module.json` → **files** |
| **2 — Loader** | Fetch, validate, merge per category | **Done** | `scripts/asset-loader.js` — `loadAssetBundlesWithOverrides`, `reloadAssetManifestsFromWorldSettings`; fallback on error |
| **3 — Defer AssetLookup** | Safe init order for consumers | **Done** | `await loadDefaultAssetBundlesFromJson()` then `initializeAssetLookupInstance` **before** `registerSettings()`; then `await loadAssetBundlesWithOverrides` + re-init + `refreshAssetDerivedChoices()` (`blacksmith.js`) |
| **4 — Settings** | Per-category Asset Mapping + reload | **Done** | Seven paths; **defaults** = shipped `resources/asset-defaults/*.json`; clear = use defaults only; `onChange` reload (`settings.js`, `lang/en.json`) |
| **5 — Companion** | Separate module for rich pack | **Not started** | JSON + art; document example `modules/<id>/...` paths |
| **6 — Docs & CHANGELOG** | Schema, migration, changelog | **In progress** | This doc + `CHANGELOG`; schema examples for authors still thin |

Split bundled asset data into JSON files, add **per-category** settings so GMs can point at their own JSON, and reserve a **companion module** for the richer art pack. Policy context: Foundry is discouraging AI-generated images in packages; core should ship **generic / clearly licensed** defaults.

**Related:** `resources/asset-defaults/*.json`, `scripts/asset-loader.js`, `scripts/asset-lookup.js`, `scripts/constants-generator.js`, `scripts/settings.js`.

---

## Endgame (ship target)

- **Authoring** lives only in `resources/asset-defaults/*.json`. **No Node, no build step** — Foundry loads defaults with `fetch` (`loadDefaultAssetBundlesFromJson`).
- **Runtime** uses `AssetLookup` (`assetLookup`, `mvpTemplates`, `dataCollections`) for features and APIs; bootstrap is **`await loadDefaultAssetBundlesFromJson()`** in `blacksmith.js` `ready`, then `reloadAssetManifestsFromWorldSettings` in `asset-loader.js`.
- **Asset Mapping** merges per-category JSON over the default baseline via `loadAssetBundlesWithOverrides`.

---

## The “load time” thing in plain English

**What happens today**

- Default manifests live as **JSON files** under the module path. They are **not** embedded in a second generated JS bundle.
- During `ready`, the module **`await`s `loadDefaultAssetBundlesFromJson()`** (parallel `fetch`), then builds `AssetLookup`. Optional Asset Mapping paths merge in a second async step.

**Custom JSON**

- Same mechanism: **fetch** + parse. Invalid paths fall back per category (see `asset-loader.js`).

---

## Goals

| Goal | Notes |
|------|--------|
| Policy-safe core | Defaults use generic / non–AI-problematic assets; rich pack is in a **companion** module. |
| Works out of the box | Bundled JSON under the module path; no user config required. |
| Per-category overrides | **Asset Mapping** settings: one optional path per category (empty = bundled default). |
| Companion module | Ships JSON + art (or JSON pointing at paths); users set paths to `modules/<companion-id>/...` or copy into Data. |

---

## Inventory (bundle shape / JSON files)

| Export | JSON root key | Notes |
|--------|----------------|--------|
| `dataBackgroundImages` | `images` | Token backgrounds / tiles |
| `dataIcons` | `icons` | |
| `dataNameplate` | `names` | |
| `dataSounds` | `sounds` | Large |
| `dataVolume` | `volumes` | |
| `dataBanners` | `banners` | |
| `dataBackgrounds` | `backgrounds` | Skill-check cinematic `BACK*` constants |
| `MVPTemplates` | structured object | Combat stats MVP strings — `resources/narratives-stats-mvp.json` (not Asset Mapping) |

**File layout**

- **Asset defaults** (`resources/asset-defaults/`): `assets-background-cards.json`, `assets-icons.json`, `assets-sounds.json`, `assets-banners.json`, `assets-skillchecks.json`
- **System config** (`resources/`): `config-volumes.json`, `config-nameplates.json` (not Asset Mapping)
- **Narrative** (`resources/`): `narratives-stats-mvp.json` (not Asset Mapping)

Folder example: `resources/asset-defaults/` (name TBD).

Each file should include **`manifestVersion`** (number) at the top level for future evolution.

---

## Merge order (document in UI)

1. Bundled default JSON for that category  
2. If user setting **non-empty** → fetch/parse that JSON, **replace** (or deep-merge) that category’s data  
3. Later: optional hook from companion module (same merge rules)

On invalid user file: **log**, **fall back** to bundled defaults for **that category only**.

---

## Settings: “Asset Mapping”

- New settings group (like Compendium Mapping).
- **One string per category** — Foundry path to a JSON file (e.g. under Data or another module).
- Empty string = use bundled default.
- **On change:** reload that category → rebuild `AssetLookup`’s `dataCollections` + regenerate `COFFEEPUB` / `window` constants (same as today’s `generateConstants()`).
- Optional: **Reload asset manifests** button or dev helper.

---

## Implementation phases

| Phase | Work |
|-------|------|
| **1 — Split** | Move each export into its JSON file; register paths in `module.json`; thin `assets.js` or loader that supplies the same merged shape as today (no behavior change). |
| **2 — Loader** | `loadAssetJson(url)` with validation; merge rules; error handling. |
| **3 — Defer AssetLookup** | Construct `AssetLookup` after manifests resolve (e.g. `init` / `setup`); update any consumers that assumed sync load. |
| **4 — Settings** | Register per-category path settings + `onChange` reload. |
| **5 — Companion** | Separate module with JSON + assets; document example paths. |
| **6 — Docs & CHANGELOG** | Schema examples, migration note for authors. |

---

## Files likely to touch (when implementing)

- `resources/asset-defaults/*.json`
- `scripts/asset-loader.js` (`loadDefaultAssetBundlesFromJson`, merge, reload)
- `scripts/asset-lookup.js` (`mvpTemplates`, `initializeAssetLookupInstance`)
- `scripts/constants-generator.js` (reads `assetLookup` via `getBundlesFromLookup()`)
- `scripts/settings.js` (Asset Mapping group + keys)
- `scripts/blacksmith.js` (`ready` init order)
- `module.json` (include JSON files)

---

## Testing checklist

- Fresh world, no overrides: all features that use sounds/themes/banners still work.
- Each category: point at valid custom JSON → data changes; broken path → fallback + notification.
- Companion paths: `modules/<id>/...` resolves correctly.

---

## Reference — implemented files

- `resources/asset-defaults/*.json` — shipped defaults; **files** in `module.json`; see `resources/asset-defaults/README.md`
- `scripts/asset-loader.js` — `loadDefaultAssetBundlesFromJson`, `loadAssetBundlesWithOverrides`, `reloadAssetManifestsFromWorldSettings`
- `scripts/asset-lookup.js` — `AssetLookup` takes bundle namespace; `export let assetLookup`; `initializeAssetLookupInstance()`
