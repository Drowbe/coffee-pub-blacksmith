# Asset defaults (JSON)

These files mirror the bundled exports in `resources/assets-legacy.js` (via `resources/assets.js`). They are shipped for reference, tooling, companion modules, and optional future loaders.

**Regenerate** after editing `assets-legacy.js`:

- **Node:** `node scripts/extract-assets-to-json.mjs`
- **Windows (no Node):** `powershell -ExecutionPolicy Bypass -File scripts/extract-assets-to-json.ps1`

**Runtime:** Foundry does **not** require Node or PowerShell. **Manage Content → Asset Mapping** defaults each category to `modules/coffee-pub-blacksmith/resources/asset-defaults/<file>.json` (module id from `module.json`). After load, merged data should match `assets-legacy.js` if you regenerate these files after editing the bundle. **Clear** a field in settings to skip fetching that file and use only embedded JS for that category.

Each file includes top-level `manifestVersion` (currently `1`) plus the same keys as the matching export (`images`, `icons`, `names`, `sounds`, `volumes`, `banners`, `backgrounds`, or MVP template keys). Chat card **UI** themes are defined in `scripts/api-chat-cards.js`, not in asset defaults.
