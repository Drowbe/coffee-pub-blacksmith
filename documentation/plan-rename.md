# Potential File Rename Plan

Purpose: propose a consistent, low-risk file naming direction before broad refactors.

Status: **Nearly complete** — one optional rename left: `window-base-v2.js` → `window-base.js` (see **Remaining** below). Everything else on this plan is done and verified in-tree.

Completed:
- Batch 1 `journal-dom-watchdog` -> `manager-journal-dom` canonicalized, imports switched, old filename removed.
- Batch 1 `vote-manager` -> `manager-vote` canonicalized, imports switched, old filename removed.
- Batch 2 `common` -> `utility-common` canonicalized, imports switched, old filename removed.
- Batch 2 `sidebar-pin` -> `ui-sidebar-pin` canonicalized, imports switched, old filename removed.
- Batch 2 `sidebar-style` -> `ui-sidebar-style` canonicalized, imports switched, old filename removed.
- Batch 3 `encounter-toolbar` -> `ui-journal-encounter`, `combat-tracker` -> `ui-combat-tracker`, `combat-tools` -> `ui-combat-tools`, `journal-tools` -> `manager-journal-tools`, `journal-page-pins` -> `ui-journal-pins`, `vote-config` -> `window-vote-config` — canonicalized, imports + `module.json` updated, old filenames removed.
- **Pre–Batch 4 (low risk)**: `latency-checker.js` → `manager-latency-checker.js`; `window-pin-config.js` → `window-pin-configuration.js` — imports and docs updated, old filenames removed.
- **Batch 4 (partial)**: `data-collection-processor.js` → `manager-data-collection.js` — `constants-generator.js` import updated; class name left `DataCollectionProcessor` (static helpers only, no instance lifecycle).

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

## Potential Rename Table

**Remaining** (not yet done) are listed first. **Done** rows are struck through; canonical filenames match the “Potential Rename” column (see **Completed** above for batch context).

### Remaining (Batch 4 — last item)

| Current File | Potential Rename | Why | Risk | Notes |
| --- | --- | --- | --- | --- |
| `scripts/window-base-v2.js` | `scripts/window-base.js` | v2 is the only base; filename suffix is redundant once you accept the churn. | Medium | Global `rg`/`grep` for `window-base-v2`; update `blacksmith.js`, every window subclass, docs, examples. **Public API:** keep `api.BlacksmithWindowBaseV2` / `getWindowBaseV2()` and class name `BlacksmithWindowBaseV2` unless you deliberately rename the class (would affect Regent and docs). Optional one-release shim: `window-base-v2.js` re-exporting `window-base.js` for stale deep links. **Verify:** world load; at least one Application V2 window using the base; Regent’s query window (if installed). |

### Done (archive)

| ~~Current File~~ | ~~Potential Rename~~ | Why | Risk | Notes |
| --- | --- | --- | --- | --- |
| ~~`scripts/latency-checker.js`~~ | ~~`scripts/manager-latency-checker.js`~~ | Manager-like lifecycle. | Low | Pre–Batch 4. |
| ~~`scripts/common.js`~~ | ~~`scripts/utility-common.js`~~ | Helper-only intent explicit. | Low | Shim `scripts/common.js` may still re-export for stale links. |
| ~~`scripts/sidebar-pin.js`~~ | ~~`scripts/ui-sidebar-pin.js`~~ | UI-layer sidebar behavior. | Low | Batch 2. |
| ~~`scripts/sidebar-style.js`~~ | ~~`scripts/ui-sidebar-style.js`~~ | UI-focused styling/controller. | Low | Batch 2. |
| ~~`scripts/journal-dom-watchdog.js`~~ | ~~`scripts/manager-journal-dom.js`~~ | Shared journal DOM watcher; `manager-*`. | Low | Batch 1. |
| ~~`scripts/vote-manager.js`~~ | ~~`scripts/manager-vote.js`~~ | Role-first manager naming. | Low | Batch 1. |
| ~~`scripts/window-pin-config.js`~~ | ~~`scripts/window-pin-configuration.js`~~ | Clearer window script name. | Low | Pre–Batch 4; templates/CSS still `window-pin-config.*`. |
| ~~`scripts/encounter-toolbar.js`~~ | ~~`scripts/ui-journal-encounter.js`~~ | Journal-toolbar UI, not menubar. | Medium | Batch 3. |
| ~~`scripts/combat-tracker.js`~~ | ~~`scripts/ui-combat-tracker.js`~~ | UI vs service ownership. | Medium | Batch 3. |
| ~~`scripts/combat-tools.js`~~ | ~~`scripts/ui-combat-tools.js`~~ | UI role. | Medium | Batch 3. |
| ~~`scripts/journal-tools.js`~~ | ~~`scripts/manager-journal-tools.js`~~ | Hook lifecycle orchestration. | Medium | Batch 3. |
| ~~`scripts/journal-page-pins.js`~~ | ~~`scripts/ui-journal-pins.js`~~ | Journal UI naming. | Medium | Batch 3; shim `scripts/journal-page-pins.js` may still re-export. |
| ~~`scripts/vote-config.js`~~ | ~~`scripts/window-vote-config.js`~~ | Application window, not manager. | Medium | Batch 3. |

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

1. ~~**Low-risk cosmetics**~~ — Done (Batches 1–2, pre–Batch 4).
2. ~~**UI role clarifications**~~ — Done (Batch 3).
3. **Semantic/contract-sensitive**: ~~`data-collection-processor` → `manager-data-collection`~~ **done**. **Next:** `window-base-v2` → `window-base` only when you want that import/doc sweep.

## How To Tackle This (execution plan)

1. **Batch 1 (very low risk, 3-4 files) — Completed**
   - `journal-dom-watchdog` -> `manager-journal-dom`
   - `vote-manager` -> `manager-vote`
   - Verify: startup load, basic journal interactions, vote window open.

2. **Batch 2 (low risk, utility/UI cosmetics) — Completed**
   - `common` -> `utility-common`
   - `sidebar-pin` / `sidebar-style` -> `ui-sidebar-*`
   - `window-pin-config` -> `window-pin-configuration` (done with pre–Batch 4 pass)
   - Verify: sidebar behavior, pin config open, no missing imports.

3. **Batch 3 (medium risk, domain role clarity) — Completed**
   - `encounter-toolbar` -> `ui-journal-encounter`
   - `combat-tracker` -> `ui-combat-tracker`
   - `combat-tools` -> `ui-combat-tools`
   - `journal-tools` -> `manager-journal-tools`
   - `journal-page-pins` -> `ui-journal-pins`
   - `vote-config` -> `window-vote-config`
   - Verify: encounter bar, combat tools/tracker, journal pins/tools, vote flows.

4. **Batch 4 (semantic-sensitive) — in progress**
   - ~~`data-collection-processor` → `manager-data-collection`~~ — **Done** (filename only; static `DataCollectionProcessor`).
   - `window-base-v2` → `window-base` — **Remaining** (see table above for scope, API, shim, verify).

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

