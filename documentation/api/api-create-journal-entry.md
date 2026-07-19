# Blacksmith `createJournalEntry` API

**Audience:** Modules (e.g. Regent) that build area, encounter, or location journals from JSON and must **not** import Blacksmith `scripts/*`.

**Contract:** Same behavior as Blacksmith's internal JSON journal import (implemented in `utility-common.js`). Call only after Foundry **`ready`** (GM creates documents).

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (!api?.createJournalEntry) return;
await api.createJournalEntry(journalData);
```

---

## `createJournalEntry(journalData)`

**Parameters**

- `journalData` (`Object`): Structured payload. Required: a **`journaltype`** string (case-insensitive) that selects the code path:
  - **`AREA`** — playable scene journal (`blocks` envelope; see `prompt-journal-profile-area.txt`). **Area Narrative** copy prompt: `prompt-journal-core.txt` + profile (JSON only). Images: **Illustration Image** (`prompt-journal-visual-illustration.txt` — proven ink-and-wash contract + `[ADD-ILLUSTRATION-*]` facets); **Portrait Image** (`prompt-journal-visual-core.txt` + `prompt-journal-visual-portrait.txt` + `[ADD-PORTRAIT-*]`).
  - **`ENCOUNTER`** — encounter journal (Blacksmith encounter template / legacy encounter JSON).
  - **`LOCATION`** — location encyclopedia journal (dedicated location template / folder rules). **Location** Import JSON copy is JSON-only (`prompt-location.txt`); generate card art with **Illustration Image**, then set `locationimage` on import.

Legacy **`NARRATIVE`** import is **not supported** (use **`AREA`** with `blocks.*`).

**Optional / common fields** (depending on type; align with Blacksmith JSON import):

- **`foldername`** — Journal folder name; folder is created under JournalEntry if missing.
- **Area:** `realm`, `region`, `site`, `area`, `scenetitle`, `breadcrumb`, `blocks` (`preparation`, `area`, `encounter`, `conversations`), etc.
- **Encounter:** `realm`, `region`, `site`, `area`, `scenetitle`, `prepencounter`, `prepencounterdetails`, `preprewards`, `prepsetup`, `sections` / `cards`, `linkedEncounters`, etc.
- **Location:** `title`, `scenetitle`, `journalname`, `realm`, `region`, `site`, `area`, `locationimage` / `image`, and other fields consumed by the location builder (see `createLocationJournalEntry` in `utility-common.js`).

**Returns:** `Promise<undefined>`.

This does not currently return the created entry: it resolves to `undefined` even on success. The journal is created correctly, but you get no handle back — find it afterward by the folder/name you passed (e.g. `game.journal.getName(...)`):

```javascript
const entry = await api.createJournalEntry(data);
entry.sheet.render(true);   // TypeError: entry is undefined
```

Unsupported input throws rather than being handled internally — a `NARRATIVE` journaltype, any unrecognised type, missing required blocks, and template failures all throw — so wrap the call in `try/catch`.

**Permissions:** Creating folders and journal entries requires appropriate GM/world permissions, same as the in-app import.

---

## Related

- **Window / UI:** Use **`api.registerWindow` / `api.openWindow`** for Application V2 windows; see **`api-window.md`**.

---

*Implementation: `scripts/utility-common.js` (`createJournalEntry`).*
