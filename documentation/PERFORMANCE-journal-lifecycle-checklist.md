# Journal / encounter lifecycle checklist (perf stack ranks 1–3)

Actionable steps aligned with **`documentation/PERFORMANCE.md`**. Update **PERFORMANCE.md** / **TODO.md** when items move from “active” to “done”.

---

## Rank 1 — Encounter toolbar (`scripts/encounter-toolbar.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 1.1 | **Track long-lived handles** | `MutationObserver` on `document.body`, **`setInterval` (~500 ms)** active-page poll, **`document` capture-phase click** for page nav. |
| 1.2 | **Teardown** | `EncounterToolbar.dispose()` disconnects observer, `clearInterval`, `removeEventListener` (same capture flag as add). |
| 1.3 | **HookManager IDs** | Store IDs from `registerHook` (journal sheet / page sheet / `updateJournalEntryPage` / `settingChange`); `removeCallback` in `dispose`. Token CR hooks already use `_tokenHookIds` — cleared in `dispose`. |
| 1.4 | **Idempotent `init`** | Guard so hot reload / double init does not stack observers or intervals. |
| 1.5 | **World exit** | `Hooks.once('closeGame', …)` calls `dispose()` (see `blacksmith.js`). |
| 1.6 | **Optional** | If v13 journal hooks prove reliable everywhere, narrow or remove the global observer + poll (measure before deleting). |

---

## Rank 2 — Journal page pins (`scripts/journal-page-pins.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 2.1 | **Track handles** | `_domObserver` on `document.body`, **`setInterval` (2000 ms)** `_scanUiWindows`, direct **`Hooks.on`** (sheet / page / **`renderApplication`** filter). |
| 2.2 | **Teardown** | `JournalPagePins.dispose()` — `disconnect`, `clearInterval`, `Hooks.off` using **stable bound references** (same function reference as `Hooks.on`). |
| 2.3 | **HookManager** | Store `registerHook` IDs for `renderJournalSheet` + `renderJournalPageSheet`; `removeCallback` in `dispose`. |
| 2.4 | **Idempotent `init`** | Single registration path; `dispose` clears `_initialized` (full re-init after dispose in-session is not supported because of `Hooks.once('ready', …)` — reload world or F5). |
| 2.5 | **Optional** | Drop redundant **`renderApplication`** listener if HookManager + sheet hooks cover all journal apps in your test matrix (reduces global hook noise). |
| 2.6 | **Future** | If **`PinManager.registerHandler`** gains an unregister API, remove the journal-page `doubleClick` handler in `dispose` for symmetry. |

---

## Rank 3 — Duplicate journal monitoring (`scripts/blacksmith.js` + encounter + pins)

| Source | What it does |
| --- | --- |
| **EncounterToolbar** | `renderJournalSheet` / `renderJournalPageSheet` / `updateJournalEntryPage` + body `MutationObserver` + 500 ms poll + capture click. |
| **JournalPagePins** | Same hooks (direct + HookManager) + body `MutationObserver` + 2 s poll + `renderApplication` filter. |
| **Blacksmith (double-click)** | `Hooks.once('ready')` block ~1760+: HookManager + **`Hooks.on`** duplicates, **debug `console.log` hook**, second **`MutationObserver`** on `document.body`, **capture `click`** for nav — overlaps encounter toolbar. |

### Consolidation plan (phased)

| Phase | Action |
| --- | --- |
| **A — Document** | Treat this file + PERFORMANCE.md §3 as the single description of overlap. |
| **B — Remove debug** | Delete the test `Hooks.on('renderJournalSheet', … console.log …)` in `blacksmith.js` when no longer needed (reduces duplicate invocations). |
| **C — Shared observer (larger refactor)** | Introduce e.g. `JournalDomWatchdog` (one `MutationObserver` + optional one poll interval) that emits “sheet root changed” / “active page changed”; encounter toolbar, pins, and double-click subscribe. **Do not** start until A/B done and you have a test checklist (open journal, switch pages, edit mode, v13 ApplicationV2). |
| **D — Unify hooks** | Prefer **HookManager-only** for sheet/page render if direct `Hooks.on` duplicates are confirmed redundant. |

---

## Verification (after changes)

1. Open journal (v13 sheet), switch pages — encounter toolbar + pin bar still appear when expected.  
2. Toggle journal edit/view — no duplicate toolbars; CPU stable over 10+ minutes with journals closed.  
3. Return to setup / reload — no duplicate intervals after re-entering world (best-effort with `closeGame` teardown).  
4. (Dev) Hot reload module — no second 500 ms / 2 s timer (idempotent `init`).

---

## Related files

- `scripts/encounter-toolbar.js` — `init`, `dispose`, `_setupGlobalObserver`, `_setupActivePageChecker`, `_setupPageNavigationListener`
- `scripts/journal-page-pins.js` — `init`, `dispose`, `_afterReady`, `_setupDomObserver`, `_registerHooks`
- `scripts/blacksmith.js` — journal double-click `Hooks.once('ready')` block; `Hooks.once('closeGame')` lifecycle
- Canonical stack table: `documentation/PERFORMANCE.md`, `documentation/TODO.md`
