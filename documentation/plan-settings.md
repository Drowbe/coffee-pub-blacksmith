# Settings & feature gating plan

Two-level affordance model:

| Level | Meaning |
|-------|--------|
| **Enable (load gate)** | Feature does not load: no registration of hooks/wrappers/menubar (ideally dynamic `import()` only when on). |
| **On/Off** | Feature loads; a setting or control only toggles runtime behavior. |

---

## Tracking table

| # | Area | Load gate today? | On/off vs visibility | Target / action | Status |
|---|------|------------------|----------------------|-----------------|--------|
| 1 | Quick View | Yes — `enableQuickViewFeature` + dynamic import; conditional libWrapper | `quickViewEnabled` = **Quickview on** | Done |
| 2 | Performance monitor | No | `menubarShowPerformance` = menubar visibility only; start menu always | **Enable** gate + optional menubar visibility; single UX (e.g. context/start only) + **`Performance`** settings section | Not started |
| 3 | Latency | Partial — init skips hooks/interval | Socket `ping`/`pong`/`latencyUpdate` always registered | No-op or don’t register handlers when `enableLatency` false | Not started |
| 4 | Pins menubar | N/A | `menubarShowPins` **never read**; tool `visible: false` hardcoded | Wire setting OR remove; **Pins** section under Canvas; move **Player Pin Editing** | Not started |
| 5 | Combat timer | Mostly yes — no hooks if disabled | — | OK; optional dynamic import later | Not started |
| 6 | Round timer | No — hooks + 1s interval always | `showRoundTimer` mostly UI template | Gate **`initialize()`** (register hooks / interval only when enabled) | Not started |
| 7 | Planning timer | No — all hooks registered up front | Handlers early-return when disabled | Register hooks only when enabled, or accept minimal callbacks | Not started |
| 8 | Combat stats | Partial — no hooks if disabled | Module still statically imported | Optional dynamic import; break timer → stats static imports | Not started |
| 9 | Player stats | Partial — no hooks if disabled | Module still statically imported | Optional dynamic import | Not started |

Update **Status** as work proceeds (e.g. Not started → In progress → Done).

---

## Findings (detail)

### Quick View

- `enableQuickViewFeature` (reload): when false, `utility-quickview.js` is not loaded from the main path; libWrapper does not register `restrictVisibility` for Quickview.
- When enabled, Quickview loads after `ready` and registers hooks, menubar, and keybinding from `QuickViewUtility.initialize()`; `restrictVisibility` sync runs only when the wrapper is registered and Quickview is active.

### Performance monitor

- `utility-performance.js` registers menubar `memory-monitor`; visibility uses `menubarShowPerformance`.
- `utility-core.js` start menu always offers performance row via `PerformanceUtility` (not gated by that setting).
- `MenuBar.updatePerformanceMonitorDisplay()` can call into `PerformanceUtility` during lightweight refresh when the label exists.

### Latency

- `LatencyChecker.initialize()` returns if `!enableLatency` (no interval / player-list decoration).
- `SocketManager` always registers latency handlers that call `LatencyChecker._handleSocketMessage` without checking the setting.

### Pins

- `menubarShowPins` is registered in `settings.js` but has **no** references in `scripts/`.
- `manager-pins.js` registers `pins-visibility` with `visible: false` hardcoded.

### Timers

- **Combat:** `combatTimerEnabled` false → `initialize()` returns before registering hooks. Good.
- **Round:** `RoundTimer.initialize()` always registers hooks, `setInterval(1000)`, focus/blur; `showRoundTimer` affects template, not registration.
- **Planning:** all `HookManager` hooks registered in `initialize()`; `planningTimerEnabled` checked inside handlers (dispatch cost remains).

### Combat / player statistics

- `CombatStats.initialize()` / `CPBPlayerStats.initialize()` return before `_registerHooks()` when tracking disabled.
- `stats-combat.js` remains in the bundle via static imports (e.g. `blacksmith.js`, timers).

---

## Implementation plan (order of attack)

1. **Convention** — Document load gate vs on/off vs visibility in one place (this file + short note in contributor-facing doc if needed).
2. **Quick View** — `enableQuickview` load gate; remove static `QuickViewUtility` from `manager-libwrapper.js` (lazy/indirect); dynamic import when enabled; rename current setting to **Quickview on**.
3. **Round timer** — Gate hook + interval registration behind an enable flag (align with combat timer pattern).
4. **Performance** — Enable flag + settings section; unify menubar vs start-menu behavior per product decision.
5. **Latency** — Guard socket handlers or register them only when enabled.
6. **Pins** — Implement `menubarShowPins` → menubar `visible`; settings layout **Canvas → Pins**.
7. **Planning timer** — Optionally defer hook registration until enabled (or accept early-return pattern).
8. **Stats** — Optional later: dynamic import to shrink cold path when tracking is off.

---

*Last updated: 2026-03-28*
