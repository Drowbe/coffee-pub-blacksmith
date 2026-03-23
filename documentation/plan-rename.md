# Potential File Rename Plan

Purpose: propose a consistent, low-risk file naming direction before broad refactors.

Status: **in progress**.
Completed:
- Batch 1 `journal-dom-watchdog` -> `manager-journal-dom` canonicalized, imports switched, old filename removed.
- Batch 1 `vote-manager` -> `manager-vote` canonicalized, imports switched, old filename removed.
- Batch 2 `common` -> `utility-common` canonicalized, imports switched, old filename removed.
- Batch 2 `sidebar-pin` -> `ui-sidebar-pin` canonicalized, imports switched, old filename removed.
- Batch 2 `sidebar-style` -> `ui-sidebar-style` canonicalized, imports switched, old filename removed.
- Batch 3 `encounter-toolbar` -> `ui-journal-encounter`, `combat-tracker` -> `ui-combat-tracker`, `combat-tools` -> `ui-combat-tools`, `journal-tools` -> `manager-journal-tools`, `journal-page-pins` -> `ui-journal-pins`, `vote-config` -> `window-vote-config` — canonicalized, imports + `module.json` updated, old filenames removed.

## Proposed Naming Rules (short form)

- Keep **kebab-case**.
- Prefer **role-first** prefixes:
  - `api-*` public module API surfaces
  - `manager-*` lifecycle/stateful orchestrators
  - `window-*` Application V2 windows
  - `ui-*` UI controllers/widgets (toolbars, trackers, sidebars, menus)
  - `timer-*` timing loops/schedulers
  - `stats-*` stat collectors/renderers
  - `utility-*` (or `util-*`) pure helpers with no lifecycle ownership
- For UI files, prefer: `ui-<global-area>-<specific-area>.js` when it improves scanning
  - Example: `ui-journal-encounter.js` (journal area, encounter feature)

## Potential Rename Table (sorted by risk: Low -> Medium)

| Current File | Potential Rename | Why | Risk | Notes |
| --- | --- | --- | --- | --- |
| `scripts/latency-checker.js` | `scripts/manager-latency-checker.js` | Lifecycle polling/monitor semantics are manager-like. | Low | Minimal conceptual change; straightforward import update. |
| `scripts/common.js` | `scripts/utility-common.js` | Makes helper-only intent explicit. | Low | Consider splitting by domain later. |
| `scripts/sidebar-pin.js` | `scripts/ui-sidebar-pin.js` | Sidebar behavior is UI-layer logic. | Low | Keep `manager-pins.js` separate for service layer. |
| `scripts/sidebar-style.js` | `scripts/ui-sidebar-style.js` | Styling/controller logic is UI-focused. | Low | Verify no implied API/service ownership. |
| `scripts/journal-dom-watchdog.js` | `scripts/manager-journal-dom.js` | Lifecycle/stateful shared watcher; aligns with `manager-*` conventions. | Low | Recommended rename for consistency; update imports in `blacksmith`, `encounter-toolbar`, `journal-page-pins`. |
| `scripts/vote-manager.js` | `scripts/manager-vote.js` | Role-first manager naming consistency. | Low | Straightforward import churn. |
| `scripts/window-pin-config.js` | `scripts/window-pin-configuration.js` | Slightly clearer intent/consistency. | Low | Optional; current name already acceptable. |
| `scripts/encounter-toolbar.js` | `scripts/ui-journal-encounter.js` | This is journal-toolbar UI logic (not menubar); journal-area naming is clearer. | Medium | Many imports; stage with a one-release re-export shim if needed. |
| `scripts/combat-tracker.js` | `scripts/ui-combat-tracker.js` | Clarifies UI ownership vs manager-style services. | Medium | Check all direct imports and menu bindings. |
| `scripts/combat-tools.js` | `scripts/ui-combat-tools.js` | Similar to above; name aligns with UI role. | Medium | Verify hooks/import side effects remain intact. |
| `scripts/data-collection-processor.js` | `scripts/manager-data-collection.js` | If stateful/orchestrated; role-first naming. | Medium | Re-evaluate if actually pure utility before renaming. |
| `scripts/journal-tools.js` | `scripts/manager-journal-tools.js` | Owns hook lifecycle + journal tool orchestration; manager role is clearer than utility. | Medium | Better fit than `utility-journal-*`; if split later, pure helpers can move to `utility-journal-*`. |
| `scripts/journal-page-pins.js` | `scripts/ui-journal-pins.js` | Journal UI naming with less implementation-detail noise than “page-pins”. | Medium | Many references; coordinate with `manager-pins.js`. |
| `scripts/vote-config.js` | `scripts/window-vote-config.js` | It is a vote window (`Application`) rather than a manager; window role is clearer. | Medium | If migrated to Application V2, keep same `window-*` name and update internals. |
| `scripts/window-base-v2.js` | `scripts/window-base.js` | If v2 is baseline project-wide, suffix can be removed. | Medium | Only after confirming no legacy base remains/returns. |

## Keep As-Is (Recommended)

These already fit the conventions well and likely do not need rename churn:

- `scripts/api-core.js`
- `scripts/api-menubar.js`
- `scripts/api-pins.js`
- `scripts/api-stats.js`
- `scripts/api-campaign.js`
- `scripts/manager-hooks.js`
- `scripts/manager-sockets.js`
- `scripts/manager-token-indicators.js`
- `scripts/manager-combatbar.js`
- `scripts/manager-canvas.js`
- `scripts/timer-combat.js`
- `scripts/timer-round.js`
- `scripts/timer-planning.js`
- `scripts/stats-combat.js`
- `scripts/stats-player.js`
- `scripts/manager-libwrapper.js` (keep as-is; third-party name is `libwrapper`)

## Suggested Rollout Order

1. **Low-risk cosmetics** (tokenization only): `common`, `journal-dom-watchdog`.
2. **UI role clarifications**: `encounter-toolbar`, `combat-tracker`, `combat-tools`, `sidebar-*`, `journal-*`.
3. **Semantic/contract-sensitive**: `data-collection-processor`, `window-base-v2`.

## How To Tackle This (execution plan)

1. **Batch 1 (very low risk, 3-4 files) — Completed**
   - `journal-dom-watchdog` -> `manager-journal-dom`
   - `vote-manager` -> `manager-vote`
   - Verify: startup load, basic journal interactions, vote window open.

2. **Batch 2 (low risk, utility/UI cosmetics) — Completed**
   - `common` -> `utility-common`
   - `sidebar-pin` / `sidebar-style` -> `ui-sidebar-*`
   - optional: `window-pin-config` -> `window-pin-configuration`
   - Verify: sidebar behavior, pin config open, no missing imports.

3. **Batch 3 (medium risk, domain role clarity) — Completed**
   - `encounter-toolbar` -> `ui-journal-encounter`
   - `combat-tracker` -> `ui-combat-tracker`
   - `combat-tools` -> `ui-combat-tools`
   - `journal-tools` -> `manager-journal-tools`
   - `journal-page-pins` -> `ui-journal-pins`
   - `vote-config` -> `window-vote-config`
   - Verify: encounter bar, combat tools/tracker, journal pins/tools, vote flows.

4. **Batch 4 (semantic-sensitive)**
   - `data-collection-processor` -> `manager-data-collection` (only if confirmed stateful)
   - `window-base-v2` -> `window-base` (only after confirming no v1/v2 split needs preserving)
   - Verify: all window classes and inheritance paths.

5. **Per-batch guardrails**
   - Keep each batch in one PR/commit.
   - Run a global import search for old names before and after.
   - Add temporary re-export shims only for medium-risk batches if needed.
   - Smoke-test world load + core module entry points every batch.

## Migration Safeguards

- Apply in small batches (2-4 files max).
- Update all static imports in same change.
- For higher-risk renames, add temporary re-export shim file for one release cycle.
- Verify startup path, dynamic imports, and Foundry hook registration side effects after each batch.

