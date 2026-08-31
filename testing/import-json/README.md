Use these sample payloads to test the JSON import dialogs.

| File | Dialog |
|------|--------|
| `journal-import-area.json` | Journal Directory → Import (template: **Area**) |
| `item-import-loot.json` | Item Directory import |
| `rolltable-import-simple.json` | Roll Table Directory import |
| `actor-import-npc.json` | Actor Directory import |
| `actor-import-sidekick.json` | Actor Directory Sidekick snapshot import |
| `actor-import-character.json` | Actor Directory friendly Character snapshot import |

Legacy samples (will **fail** import by design):

| File | Notes |
|------|--------|
| `archive/journal-import-narrative-legacy.json` | `journaltype: "NARRATIVE"` — use `journal-import-area.json` instead |

Notes:

- These are happy-path samples intended to succeed.
- Import dialogs accept either a single object or an array; these samples use a single object.
- **Area** import requires `journaltype: "area"` and a `blocks` object with at least `blocks.area` or `blocks.preparation`.
- Reload the Blacksmith module (or refresh Foundry) after pulling code changes before testing.

### Area journal quick test

1. Log in as GM, open the **Journal** directory.
2. Click **Import** → template **Area**.
3. Adjust **Location path** fields and compendium checkboxes if needed → **Copy to Clipboard** for AI generation.
4. Paste the contents of `journal-import-area.json` (or AI output) → **Import JSON**.
4. Open the new journal entry page **Area Import Test** in the storeroom folder **Blacksmith Test Imports**.
5. Optional: open the page in edit mode once — lists should already use `<li><p>…</p></li>` without needing a resave to fix bullets.
