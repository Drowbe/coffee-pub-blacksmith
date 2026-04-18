# Settings & feature gating plan

Two-level affordance model:

| Level | Meaning |
|-------|--------|
| **Enable (load gate)** | Feature does not load: no registration of hooks/wrappers/menubar (ideally dynamic `import()` only when on). |
| **On/Off** | Feature loads; a setting or control only toggles runtime behavior. |

**Related docs:** Open gating/perf follow-ups are also tracked in **`documentation/TODO.md`** (Settings & feature gating) and timer/socket notes in **`documentation/PERFORMANCE.md`**.

---

## Tracking table

| # | Area | Load gate today? | On/off vs visibility | Target / action | Status |
|---|------|------------------|----------------------|-----------------|--------|
| 1 | Quick View | Yes — `enableQuickViewFeature` + dynamic import; conditional libWrapper | `quickViewEnabled` = **Quickview on** | Done |
| 2 | Performance monitor | Yes — `enablePerformanceMonitor`; dynamic import when hamburger opens | Context menu only (no menubar tool) | Done |
| 3 | Latency | Handlers always registered; `enableLatency` gates work + checker | `enableLatency` world setting | Done |
| 4 | Pins menubar | N/A | No menubar button; **Pins** flyout on hamburger only; **Pins** H3 under Layout after **Canvas** | Done |
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

- `enablePerformanceMonitor` (reload, **user** scope): under **Developer Tools → System → Performance Monitor**; when false, the hamburger menu does not load `utility-performance.js`.
- When enabled, `utility-core.js` dynamic-imports `utility-performance.js` when building the left hamburger menu; there is no menubar heap tool.

### Latency

- `SocketManager.ensureLatencySocketHandlers()` registers `ping` / `pong` / `latencyUpdate` as soon as the socket is ready (once, idempotent). Payload handling no-ops when `enableLatency` is false so clients with latency off still accept messages and avoid SocketlibUnregisteredHandlerError from stale senders.
- `LatencyChecker._handleSocketMessage` and UI paths no-op when `enableLatency` is false; disabling runs `cleanupChecker()` (strips player-list latency UI).

### Pins

- Pin visibility and clear actions are only in the **left hamburger menu** (`CoreUIUtility.getLeftStartMenuItems` → **Pins** submenu); there is no pins tool on the main menubar strip.
- **Layout & experience → Canvas** is followed by **Pins** (`pinsAllowPlayerWrites` — Player Pin Editing).

### Developer Tools → System

- **H1 Developer Tools** is **client**-scoped so GMs and players see the same tab; world-only rows (e.g. CSS, latency) still respect Foundry’s normal GM edit rules.
- **H2 System** groups **H3 Menubar** (show Settings / Refresh in the left zone — those toggles exist in settings; wiring to `visible` in `utility-core.js` may still be pending), **H3 Performance Monitor** (`enablePerformanceMonitor`, heap poll interval), and **H3 System Latency** (`enableLatency`, interval).

### Timers

- **Combat:** `combatTimerEnabled` false → `initialize()` returns before registering hooks. Good.
- **Round:** `RoundTimer.initialize()` always registers hooks, `setInterval(1000)`, focus/blur; `showRoundTimer` affects template, not registration.
- **Planning:** all `HookManager` hooks registered in `initialize()`; `planningTimerEnabled` checked inside handlers (dispatch cost remains).

### Combat / player statistics

- `CombatStats.initialize()` / `CPBPlayerStats.initialize()` return before `_registerHooks()` when tracking disabled.
- `stats-combat.js` remains in the bundle via static imports (e.g. `blacksmith.js`, timers).

---

## Implementation plan (order of attack)

1. **Convention** — This file + cross-links in **`TODO.md`** / **`PERFORMANCE.md`** for remaining work.
2. **Quick View** — Load gate and **Quickview on** client setting are in place; any further libWrapper/lifecycle polish is optional (see **`PERFORMANCE.md`** §10).
3. **Round timer** — **Next high-value item:** gate hook + `setInterval(1000)` registration behind an enable flag (align with combat timer pattern). See **`PERFORMANCE.md`** stack / plan.
4. **Performance monitor** — **Done:** user setting under **System → Performance Monitor**; heap/report via hamburger dynamic import; no dedicated menubar heap tool.
5. **Latency** — **Done:** handlers registered as soon as the socket is ready; gate **work** on `enableLatency` (avoids Socketlib errors when clients disagree).
6. **Pins** — **Done:** hamburger **Pins** submenu only; **Layout → Canvas → Pins** for **Player Pin Editing**.
7. **Planning timer** — Optionally defer hook registration until enabled (or accept early-return pattern).
8. **Stats** — Optional later: dynamic import to shrink cold path when tracking is off.

---

*Last updated: 2026-03-28 (System settings doc, cross-links, implementation plan refreshed)*
