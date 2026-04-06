# Asset defaults (JSON)

These files mirror the bundled exports in `resources/assets-legacy.js` (via `resources/assets.js`). They are shipped for reference, tooling, companion modules, and optional future loaders.

**Regenerate** after editing `assets-legacy.js`:

- **Node:** `node scripts/extract-assets-to-json.mjs`
- **Windows (no Node):** `powershell -ExecutionPolicy Bypass -File scripts/extract-assets-to-json.ps1`

**Runtime:** Foundry does **not** require Node or PowerShell. The module uses the bundled JS data; optional **Asset Mapping** paths point at JSON you supply.

Each file includes top-level `manifestVersion` (currently `1`) plus the same keys as the matching export (`images`, `icons`, `names`, `sounds`, `volumes`, `banners`, `backgrounds`, or MVP template keys). Chat card **UI** themes are defined in `scripts/api-chat-cards.js`, not in asset defaults.
