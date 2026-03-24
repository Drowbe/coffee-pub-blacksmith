# Blacksmith `createJournalEntry` API

**Audience:** Modules (e.g. Regent) that build narrative, encounter, or location journals from JSON and must **not** import Blacksmith `scripts/*`.

**Contract:** Same behavior as Blacksmith’s internal JSON journal import (implemented in `utility-common.js`). Call only after Foundry **`ready`** (GM creates documents).

```javascript
const api = game.modules.get('coffee-pub-blacksmith')?.api;
if (!api?.createJournalEntry) return;
await api.createJournalEntry(journalData);
```

---

## `createJournalEntry(journalData)`

**Parameters**

- `journalData` (`Object`): Structured payload. Required: a **`journaltype`** string (case-insensitive) that selects the code path:
  - **`ENCOUNTER`** — encounter journal (Blacksmith encounter template).
  - **`NARRATIVE`** — narrative journal (Blacksmith narrative template).
  - **`LOCATION`** — location journal (dedicated location template / folder rules).

**Optional / common fields** (depending on type; align with Blacksmith JSON import):

- **`foldername`** — Journal folder name; folder is created under JournalEntry if missing.
- **Narrative / encounter:** `realm`, `region`, `site`, `area`, `scenetitle`, `contextintro`, `prepencounter`, `prepencounterdetails`, `preprewards`, `prepsetup`, `sections` (array) or flat `sectiontitle` / `sectionintro` / `cards` / legacy card fields, `linkedEncounters`, context fields (`contextadditionalnarration`, `contextatmosphere`, `contextgmnotes`), etc.
- **Location:** `title`, `scenetitle`, `journalname`, `realm`, `region`, `site`, `area`, `locationimage` / `image`, and other fields consumed by the location builder (see `createLocationJournalEntry` in `utility-common.js`).

**Returns:** `Promise<JournalEntry>` (or void in error paths handled internally — match Blacksmith import behavior).

**Permissions:** Creating folders and journal entries requires appropriate GM/world permissions, same as the in-app import.

---

## Related

- **Window / UI:** Use **`api.registerWindow` / `api.openWindow`** for Application V2 windows; see **documentation/api-window.md**.
- **Wiki:** Mirror this page under the Blacksmith wiki (e.g. **API: Journal** or a subsection of **API: Supplement**) so it sits beside other public APIs.

---

*Implementation: `scripts/utility-common.js` (`createJournalEntry`).*
