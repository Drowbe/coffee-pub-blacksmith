# Asset manifests & “Asset Mapping” settings — plan

Split bundled asset data into JSON files, add **per-category** settings so GMs can point at their own JSON, and reserve a **companion module** for the richer art pack. Policy context: Foundry is discouraging AI-generated images in packages; core should ship **generic / clearly licensed** defaults.

**Related:** `resources/assets.js` (current monolith), `scripts/asset-lookup.js`, `scripts/constants-generator.js`, `scripts/settings.js`.

---

## The “load time” thing in plain English

**What happens today**

- When Foundry loads the module, JavaScript runs **immediately**.
- At the end of `asset-lookup.js` we have something like: **create `AssetLookup` now and export it**.
- That object **reads** all the theme/sound/banner arrays **in that same instant** — from the baked-in `assets.js` data.

**Why that matters for custom JSON**

- Loading a **user** JSON file is **not** instant: the browser has to **fetch** the file over the network and **parse** it. That takes a moment.
- So we **cannot** honestly fill `AssetLookup` with user data **at the exact millisecond** the module file first loads — unless we only use built-in data.

**So we have two honest options**

1. **Wait, then build** — Don’t create `AssetLookup` until **after** we’ve loaded defaults (and any overrides) from JSON. Anything that needed `assetLookup` before that either waits or uses a tiny stub until ready.

2. **Start with defaults, swap later** — Create `AssetLookup` once with **bundled** JSON first, then **reload** the same object when the user’s file arrives (more moving parts).

**Recommendation:** **Wait, then build** (or defer the singleton) so the first real state is “we have merged data.” Document that a few callers may need **`await` hook** or a `ready` flag.

**One sentence:** *Built-in data can load synchronously; user files load asynchronously. Today’s code assumes data is ready the moment the module loads — we must change that assumption when user paths are involved.*

---

## Goals

| Goal | Notes |
|------|--------|
| Policy-safe core | Defaults use generic / non–AI-problematic assets; rich pack is in a **companion** module. |
| Works out of the box | Bundled JSON under the module path; no user config required. |
| Per-category overrides | **Asset Mapping** settings: one optional path per category (empty = bundled default). |
| Companion module | Ships JSON + art (or JSON pointing at paths); users set paths to `modules/<companion-id>/...` or copy into Data. |

---

## Inventory (what we split from `assets.js`)

| Export | JSON root key | Notes |
|--------|----------------|--------|
| `dataTheme` | `themes` | Chat card themes |
| `dataBackgroundImages` | `images` | Token backgrounds / tiles |
| `dataIcons` | `icons` | |
| `dataNameplate` | `names` | |
| `dataSounds` | `sounds` | Large |
| `dataVolume` | `volumes` | |
| `dataBanners` | `banners` | |
| `dataBackgrounds` | `backgrounds` | Skill-check cinematic `BACK*` constants |
| `MVPTemplates` | structured object | Combat stats MVP strings — same file or `assets-mvp-templates.json` |

Suggested file names (examples):

- `assets-themes.json`
- `assets-background-images.json`
- `assets-icons.json`
- `assets-nameplates.json`
- `assets-sounds.json`
- `assets-volumes.json`
- `assets-banners.json`
- `assets-backgrounds.json`
- `assets-mvp-templates.json` (if split)

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

- `resources/asset-defaults/*.json` (new)
- `resources/assets.js` (shrink or replace with loader)
- `scripts/asset-lookup.js` (deferred init, reload API)
- `scripts/constants-generator.js` (import from loader or passed data)
- `scripts/settings.js` (Asset Mapping group + keys)
- `scripts/blacksmith.js` (init order if AssetLookup moves)
- `module.json` (include JSON files)
- `scripts/settings.js` / `api-stats.js` / `stats-combat.js` / `api-pins.js` — any static import from `assets.js` must follow the new data source

---

## Testing checklist

- Fresh world, no overrides: all features that use sounds/themes/banners still work.
- Each category: point at valid custom JSON → data changes; broken path → fallback + notification.
- Companion paths: `modules/<id>/...` resolves correctly.

---

## Status

| Phase | Status |
|-------|--------|
| 1 Split | **In progress** — `assets.js` re-exports `assets-legacy.js`; run `node scripts/extract-assets-to-json.mjs` to emit `resources/asset-defaults/*.json` |
| 2 Loader | **Done** — `loadAssetBundlesWithOverrides` fetches optional JSON per Asset Mapping path; invalid/missing file falls back to bundled data for that category |
| 3 Defer AssetLookup | **Done** — `registerSettings()` → **sync** `initializeAssetLookupInstance(bundled)` before **any** `await` (so interleaved `ready` hooks never see null), then `await` merge + re-init + `refreshAssetDerivedChoices()` |
| 4 Settings | **Done** — Asset Mapping: 8 paths + `onChange` → `reloadAssetManifestsFromWorldSettings()` |
| 5 Companion | Not started |
| 6 Docs | This file |

Update this table as work proceeds.

### Implemented files (reference)

- `resources/assets.js` — re-exports from `assets-legacy.js`
- `resources/assets-legacy.js` — full bundled data (copy of former monolith)
- `scripts/asset-loader.js` — `loadAssetBundlesWithOverrides`, `reloadAssetManifestsFromWorldSettings`
- `scripts/asset-lookup.js` — `AssetLookup` takes bundle namespace; `export let assetLookup`; `initializeAssetLookupInstance()`
- `scripts/extract-assets-to-json.mjs` — JSON emitter for defaults
