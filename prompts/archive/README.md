# Archived item import prompts

Superseded by the unified **core + partial + profile** layout (see `prompts/prompt-item-core.txt` and `prompt-item-profile-*.txt`).

| File | Replaced by |
|------|-------------|
| `prompt-items-loot.txt` | `prompt-item-core.txt` + `prompt-item-profile-loot.txt` |
| `prompt-items-consumables.txt` | `prompt-item-core.txt` + `prompt-item-profile-consumable.txt` |
| `prompt-artificer-item.txt` | `prompt-item-core.txt` + `prompt-item-partial-artificer.txt` + `prompt-item-profile-artificer.txt` |

Kept for reference only; the item directory Import UI does not load these files.

## Archived roll table import prompts

Superseded by `prompt-rolltable-core.txt` and `prompt-rolltable-profile-*.txt`.

| File | Replaced by |
|------|-------------|
| `prompt-rolltable-text.txt` | core + `prompt-rolltable-profile-text.txt` |
| `prompt-rolltable-document-custom.txt` | core + `prompt-rolltable-profile-document-custom.txt` |
| `prompt-rolltable-document-items.txt` | core + `prompt-rolltable-profile-document-item.txt` |
| `prompt-rolltable-document-actor.txt` | core + `prompt-rolltable-profile-document-actor.txt` |
| `prompt-rolltable-compendium-items.txt` | core + `prompt-rolltable-profile-compendium-item.txt` |
| `prompt-rolltable-compendium-actors.txt` | core + `prompt-rolltable-profile-compendium-actor.txt` |

The roll table directory Import UI loads only the core + profile files.

## Archived area/narrative journal (legacy schema)

| File | Replaced by |
|------|-------------|
| `prompt-narratives.txt` (sections/cards schema) | `prompt-journal-core.txt` + `prompt-journal-profile-area.txt` |
| `prompt-journal-visual-styles.txt` (monolith) | Core (no style) + `prompt-journal-visual-illustration.txt` or `prompt-journal-visual-portrait.txt` (full style per type; portrait facets prefilled in Import JSON) |
| `templates/archive/journal-narrative.hbs` | `templates/journal-area.hbs` + `scripts/parsers/parse-journal-area.js` |

Import supports **`journaltype`: `"area"`** with `blocks` only. Legacy **`NARRATIVE`** JSON is rejected.

Example envelope:

```json
{
  "journaltype": "area",
  "foldername": "...",
  "realm": "", "region": "", "site": "", "area": "",
  "breadcrumb": "...",
  "scenetitle": "...",
  "blocks": { "preparation": {}, "area": {} }
}
```
