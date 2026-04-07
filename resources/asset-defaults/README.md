# Asset defaults (JSON)

Shipped **visual/audio** lists under this folder. At runtime, Foundry loads them with `fetch` (`scripts/asset-loader.js` → `loadDefaultAssetBundlesFromJson`). **No build step, no Node.**

| File | Role |
|------|------|
| `assets-background-cards.json` | Chat card / tile background images (`images`) |
| `assets-icons.json` | Icons (`icons`) |
| `assets-sounds.json` | Sounds (`sounds`) |
| `assets-banners.json` | Banners (`banners`) |
| `assets-skillchecks.json` | Skill-check cinematic backgrounds (`backgrounds`, `BACK*` constants) |

**Not in this folder (system / narrative, not Asset Mapping):**

- `resources/config-volumes.json` — volume presets (`volumes`)
- `resources/config-nameplates.json` — nameplate modes (`names`)
- `resources/narratives-stats-mvp.json` — combat MVP narrative templates

Each JSON file includes top-level `manifestVersion` (currently `1`) plus the keys above. Chat card **UI** themes are in `scripts/api-chat-cards.js`.

**Runtime:** **Manage Content → Asset Mapping** overrides **only** the asset-defaults categories listed in settings (card backgrounds, icons, sounds, banners, skill-check backgrounds). **Clear** a field to use shipped defaults for that category.
