# Asset defaults (JSON)

These files are the **authoring source** for default asset manifests. At runtime, Foundry loads them with `fetch` from the module path (`scripts/asset-loader.js` → `loadDefaultAssetBundlesFromJson`). **No build step, no Node** — edit JSON and reload the world (or change Asset Mapping paths).

Each file includes top-level `manifestVersion` (currently `1`) plus the same keys as the matching export (`images`, `icons`, `names`, `sounds`, `volumes`, `banners`, `backgrounds`, or MVP template keys). Chat card **UI** themes are defined in `scripts/api-chat-cards.js`, not in asset defaults.

**Runtime:** **Manage Content → Asset Mapping** can point each category at a custom JSON path; empty uses the shipped defaults under `resources/asset-defaults/`. **Clear** a field in settings to skip fetching that override for that category.
