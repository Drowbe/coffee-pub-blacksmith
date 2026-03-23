# Journal / encounter lifecycle checklist (perf stack ranks 1–3)

Actionable steps aligned with **`documentation/PERFORMANCE.md`**. Update **PERFORMANCE.md** / **TODO.md** when items move from “active” to “done”.

---

## Rank 1 — Encounter toolbar (`scripts/ui-journal-encounter.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 1.1 | **Track long-lived handles** | Uses shared `JournalDomWatchdog` for journal sheet/page events; no per-feature body `MutationObserver`, interval, or page-nav click listener. |
| 1.2 | **Teardown** | `EncounterToolbar.dispose()` unregisters watchdog handlers and removes token/hooks; no per-feature body observer/interval teardown required. |
| 1.3 | **HookManager IDs** | Store IDs from `registerHook` (journal sheet / page sheet / `updateJournalEntryPage` / `settingChange`); `removeCallback` in `dispose`. Token CR hooks already use `_tokenHookIds` — cleared in `dispose`. |
| 1.4 | **Idempotent `init`** | Guard so hot reload / double init does not stack observers or intervals. |
| 1.5 | **World exit** | `Hooks.once('closeGame', …)` calls `dispose()` (see `blacksmith.js`). |
| 1.6 | **Optional** | If v13 journal hooks prove reliable everywhere, narrow or remove the global observer + poll (measure before deleting). |

---

## Rank 2 — Journal page pins (`scripts/ui-journal-pins.js`; optional shim `scripts/journal-page-pins.js`)

| Step | Task | Detail |
| --- | --- | --- |
| 2.1 | **Track handles** | Uses shared `JournalDomWatchdog` for journal sheet/page events; no per-feature body `_domObserver` or interval polling. |
| 2.2 | **Teardown** | `JournalPagePins.dispose()` unregisters watchdog handlers and removes HookManager/direct hook handlers. |
| 2.3 | **HookManager** | Store `registerHook` IDs for `renderJournalSheet` + `renderJournalPageSheet`; `removeCallback` in `dispose`. |
| 2.4 | **Idempotent `init`** | Single registration path; `dispose` clears `_initialized` (full re-init after dispose in-session is not supported because of `Hooks.once('ready', …)` — reload world or F5). |
| 2.5 | **Optional** | Drop redundant **`renderApplication`** listener if HookManager + sheet hooks cover all journal apps in your test matrix (reduces global hook noise). |
| 2.6 | **Future** | If **`PinManager.registerHandler`** gains an unregister API, remove the journal-page `doubleClick` handler in `dispose` for symmetry. |

---

## Rank 3 — Duplicate journal monitoring (`scripts/blacksmith.js` + encounter + pins)

| Source | What it does |
| --- | --- |
| **EncounterToolbar** | Still uses HookManager render hooks, but body DOM watching + polling is consolidated into `JournalDomWatchdog`. |
| **JournalPagePins** | Still uses hooks for rendering, but prior body DOM observer + interval polling is consolidated into `JournalDomWatchdog`. |
| **Blacksmith (double-click)** | Uses HookManager render hooks and now relies on `JournalDomWatchdog` instead of its own MutationObserver + page-nav click listener. |

### Consolidation plan (phased)

| Phase | Action |
| --- | --- |
| **A — Document** | Treat this file + PERFORMANCE.md §3 as the single description of overlap. |
| **B — Remove debug** | Delete the test `Hooks.on('renderJournalSheet', … console.log …)` in `blacksmith.js` when no longer needed (reduces duplicate invocations). |
| **C — Shared observer (larger refactor)** | Completed: added `scripts/manager-journal-dom.js` and rewired `blacksmith.js`, `ui-journal-encounter.js`, and `ui-journal-pins.js` to subscribe to shared sheet/page events. |
| **D — Unify hooks** | Prefer **HookManager-only** for sheet/page render if direct `Hooks.on` duplicates are confirmed redundant. |

---

## Verification (after changes)

1. Open journal (v13 sheet), switch pages — encounter toolbar + pin bar still appear when expected.  
2. Toggle journal edit/view — no duplicate toolbars; CPU stable over 10+ minutes with journals closed.  
3. Return to setup / reload — no duplicate intervals after re-entering world (best-effort with `closeGame` teardown).  
4. (Dev) Hot reload module — no second 500 ms / 2 s timer (idempotent `init`).

---

## Related files

- `scripts/manager-journal-dom.js` — shared journal sheet/page DOM observer + interval fallback
- `scripts/ui-journal-encounter.js` — `init`/`dispose` now registers/unregisters `JournalDomWatchdog` handlers (body observer/interval removed from the manager itself)
- `scripts/ui-journal-pins.js` — `_afterReady` registers `JournalDomWatchdog` handlers; `dispose` unregisters
- `scripts/blacksmith.js` — journal double-click setup now subscribes to `JournalDomWatchdog` instead of owning a second MutationObserver
- Canonical stack table: `documentation/PERFORMANCE.md`, `documentation/TODO.md`
