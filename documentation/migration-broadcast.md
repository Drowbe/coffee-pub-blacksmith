# Migration: Broadcast → Herald (coffee-pub-herald)

This document describes the plan to extract the **Broadcast** feature from **Coffee Pub Blacksmith** into a new module named **Herald** (`coffee-pub-herald`). Herald will depend on Blacksmith and use only Blacksmith’s public APIs, following the same pattern as other Coffee Pub modules (e.g. Regent).

**Scope:** Planning and documentation only. No code changes are made until implementation is approved.

---

## 1. Goals

- **Modularity:** Move all Broadcast (streaming/cameraman) functionality into a dedicated module so it can be updated or disabled independently.
- **Clean API usage:** Herald uses only Blacksmith’s public surface (`module.api`, Hook Manager, and documented patterns). This encourages stable APIs and benefits other modules that integrate with Blacksmith.
- **Naming:** The new module is **Herald** with module ID **`coffee-pub-herald`**.

---

## 2. Preconditions: What Herald Needs from Blacksmith

Herald will rely only on existing (or minor additive) Blacksmith APIs.

### 2.1 Already Public and Required

- **Menubar API** (`documentation/api-menubar.md`):
  - `registerMenubarTool`, `unregisterMenubarTool`
  - `registerSecondaryBarType`, `registerSecondaryBarItem`, `unregisterSecondaryBarItem`
  - `registerSecondaryBarTool`, `updateSecondaryBarItemActive`, `toggleSecondaryBar`, `updateSecondaryBar`
  - `openSecondaryBar`, `closeSecondaryBar`, `updateMenubarToolActive`
- **Socket API** (`documentation/api-sockets.md`):
  - `sockets.waitForReady()`, `sockets.register(eventName, handler)`, `sockets.emit(eventName, data, options)`
- **Hook Manager** (`documentation/api-hookmanager.md`):
  - `HookManager.registerHook({ name, description, context, priority, callback })` for `settingChange`, `userConnected`, `userDisconnected`, `canvasReady`, `canvasInit`, `updateToken`, `updateCombat`, `renderApplication`, `unloadModule`, etc.

Access to the API is via `game.modules.get('coffee-pub-blacksmith')?.api` or the timing-safe **BlacksmithAPI** bridge (`api/blacksmith-api.js`).

### 2.2 Optional API Addition: Menubar Refresh

Currently, Broadcast calls **`MenuBar.renderMenubar()`** (and sometimes `MenuBar.renderMenubar(true)`) when settings or users change, so the broadcast toggle and view-mode button visibility stay correct. **`renderMenubar` is not exposed on `module.api`.**

- **Recommendation:** Add a menubar refresh to the public API, e.g. **`module.api.renderMenubar`** (or `refreshMenubar`) so Herald (and other modules) can request a re-render without depending on internal MenuBar imports.
- **If not added:** Herald would have no official way to refresh the menubar; visibility updates might be delayed until the next natural re-render (e.g. scene change, another module triggering it). Documenting this as an optional addition keeps the migration possible either way.

### 2.3 Optional API Addition: Menubar Visibility Override

Today, **Blacksmith** hides the menubar for the broadcast user by reading **Blacksmith’s** `MODULE.ID` settings (`enableBroadcast`, `broadcastUserId`) inside `api-menubar.js` and calling `_removeMenubarDom()` when the current user matches.

After migration, those settings live in **Herald** (`coffee-pub-herald`). Two approaches:

- **Option A (recommended):** Blacksmith exposes a way for modules to say “hide menubar for this user,” e.g. **`registerMenubarVisibilityOverride(callback)`** where `callback(game.user)` returns something like `{ hide: true }` when the user is the broadcast user. Herald registers this and performs the check using its own settings. Blacksmith no longer reads any broadcast settings.
- **Option B:** Blacksmith continues to support “broadcast user” by reading **Herald’s** module ID settings (e.g. `game.settings.get('coffee-pub-herald', 'enableBroadcast')`). This couples Blacksmith to Herald’s setting keys and is less clean.

The migration doc assumes **Option A** is implemented so Herald owns all broadcast logic and settings.

---

## 3. What Moves to Herald

### 3.1 Code and Assets

| Current location (Blacksmith)        | New location (Herald)                          |
|--------------------------------------|------------------------------------------------|
| `scripts/manager-broadcast.js`       | `scripts/manager-herald.js` (or equivalent)    |
| `styles/broadcast.css`               | `styles/broadcast.css` (or `herald.css`)       |
| All broadcast-related settings       | Herald’s `scripts/settings.js` (see §3.2)      |
| Broadcast lang keys                  | Herald’s `lang/en.json` (and others if any)    |

Herald will have its own `module.json`, `const.js` (or equivalent) with `MODULE.ID = 'coffee-pub-herald'`, and bootstrap that initializes the Herald manager and registers with Blacksmith’s APIs.

### 3.2 Settings

All settings currently under `MODULE.ID` (Blacksmith) that are broadcast-specific move to Herald’s module ID (`coffee-pub-herald`). Keys can stay the same; only the owning module changes. Non-exhaustive list from current codebase:

- `enableBroadcast`
- `broadcastUserId`
- `broadcastAnimationDuration`, `broadcastFollowDistanceThreshold`, `broadcastFollowThrottleMs`
- `broadcastAutoCloseWindows`, `broadcastAutoCloseDelaySeconds`
- `broadcastHideBackground`, `broadcastHideInterfaceLeft`, `broadcastHideInterfaceMiddle`, `broadcastHideInterfaceRight`, `broadcastHideNotifications`
- `broadcastMode`, `broadcastFollowTokenId`, `broadcastFollowViewFill`, `broadcastCombatViewFill`, `broadcastSpectatorPartyBoxFill`
- Any other `broadcast*` keys in `scripts/settings.js`

Headers and grouping in the settings UI (e.g. “Broadcast UI”, “Broadcast Mode Configuration”) move to Herald’s registration.

### 3.3 Socket Events

Broadcast currently uses these socket event names (via Blacksmith’s socket API):

- `broadcast.gmViewportSync`
- `broadcast.playerViewportSync`
- `broadcast.modeChanged`
- `broadcast.mapView`
- `broadcast.windowCommand`
- `broadcast.windowOpened`
- `broadcast.combatTargets`

Herald will **register** and **emit** these via `blacksmith.sockets` (after `waitForReady()`). Event names stay the same so any existing documentation or cross-module expectations remain valid.

### 3.4 Menubar and Secondary Bar

- **Broadcast toggle tool** (`broadcast-toggle`): Today registered in Blacksmith’s `api-menubar.js`. After migration, **Herald** registers it via `module.api.registerMenubarTool('broadcast-toggle', { ... })` and maps it to the secondary bar with `module.api.registerSecondaryBarTool('broadcast', 'broadcast-toggle')`. Visibility can use a function that reads Herald’s `enableBroadcast` setting (Herald’s module ID).
- **Secondary bar type `broadcast`:** Currently registered from inside BroadcastManager. Herald will call `module.api.registerSecondaryBarType('broadcast', { ... })` (e.g. in a `ready` or `init` flow, after Blacksmith API is ready).
- **Secondary bar items** (e.g. `broadcast-mode-manual`, `broadcast-mode-gmview`, `broadcast-mode-combat`, tools like close images/journals/windows, refresh, settings): All registered by Herald via `module.api.registerSecondaryBarItem('broadcast', itemId, { ... })`.
- **Dynamic items** (e.g. mirror players, follow tokens): Herald continues to call `registerSecondaryBarItem` / `unregisterSecondaryBarItem` when the list of players or tokens changes.
- **“Broadcast view mode” menubar tool** (`broadcast-view-mode`): Currently registered inside BroadcastManager. Herald registers it via `module.api.registerMenubarTool('broadcast-view-mode', { ... })`.

Herald will use **`module.api.renderMenubar`** (if exposed) whenever it needs to refresh the menubar (e.g. after setting or user list changes).

### 3.5 Hooks

Herald will register its own hooks via **Blacksmith’s HookManager** (e.g. `BlacksmithHookManager` or `module.api.HookManager`), including:

- `settingChange` (Herald’s module ID, relevant keys) → update broadcast mode, then refresh menubar.
- `userConnected` / `userDisconnected` → refresh menubar (e.g. mirror list).
- `ready` (e.g. `Hooks.once('ready', ...)`) → apply broadcast mode, register camera hooks, register broadcast bar type and tools.
- `canvasReady` / `canvasInit` → initialize camera for broadcast user.
- `updateToken`, `updateCombat` → camera following logic.
- `renderApplication` (and any other UI hooks used for broadcast UI hiding).
- `unloadModule` → when `coffee-pub-herald` unloads, cleanup hooks, socket handlers, and bar/tool registrations.

All hook registration and cleanup will live in Herald; Blacksmith will not register any broadcast-specific hooks.

### 3.6 Helpers (logging, settings, user matching)

Broadcast currently uses from Blacksmith’s `api-core.js`:

- `postConsoleAndNotification` (logging)
- `getSettingSafely(MODULE.ID, key, default)`
- `matchUserBySetting(user, settingValue)` (for “is this user the broadcast user?”)

After migration:

- **Settings:** Herald uses its own module ID for all broadcast settings, so `game.settings.get('coffee-pub-herald', key)` (or a local safe wrapper) in Herald.
- **User matching:** Herald can implement a small `matchUserBySetting`-style helper locally, or use Blacksmith’s external API if one is documented (e.g. via `BlacksmithUtils` or similar in `api-core.md`). The migration does not require Blacksmith to expose this; it can be a few lines in Herald.
- **Logging:** Herald can use its own logging or the same pattern as other Coffee Pub modules (e.g. `BlacksmithUtils` if available and appropriate). No new Blacksmith API is required.

---

## 4. What Is Removed or Changed in Blacksmith

- **Remove** `BroadcastManager` and all broadcast-specific code:
  - Delete (or stop importing) `scripts/manager-broadcast.js`.
  - Remove `BroadcastManager.initialize()` and any `BroadcastManager` reference from `scripts/blacksmith.js`.
- **Remove** broadcast registration from `scripts/api-menubar.js`:
  - Remove import of `BroadcastManager`.
  - Remove registration of the `broadcast-toggle` tool and the `secondaryBarToolMapping.set('broadcast', 'broadcast-toggle')` (Herald will register these via API).
  - Remove the “broadcast user” menubar-hide block that reads `enableBroadcast` / `broadcastUserId` from Blacksmith’s `MODULE.ID`. Replace with a call to the new **menubar visibility override** callback (Option A in §2.3), if implemented.
- **Remove** all broadcast settings from `scripts/settings.js` (the blocks that register `enableBroadcast`, `broadcastUserId`, and every `broadcast*` key and their headers).
- **Remove** broadcast CSS from the main style entry: in `styles/default.css`, remove the `@import "broadcast.css";` line. Optionally remove `styles/broadcast.css` from the repo if it is fully moved to Herald.
- **Remove** broadcast-related lang keys from `lang/en.json` (and any other lang files) that are used only by the broadcast feature; they move to Herald’s lang files.
- **Optional but recommended:** Add `module.api.renderMenubar` (or `refreshMenubar`) and, if chosen, `module.api.registerMenubarVisibilityOverride(callback)` (or equivalent), and document them in `api-menubar.md` and `architecture-blacksmith.md`.

---

## 5. Herald Module Structure (Proposed)

- **`module.json`**: `name`, `title`, `version`, `esmodules`, `styles`, `socket`, `library` (if needed), `dependencies` requiring `coffee-pub-blacksmith` (and optionally `socketlib`, `lib-wrapper` if Herald uses them directly; otherwise via Blacksmith).
- **Entry script:** e.g. `scripts/herald.js` or `scripts/init.js` that imports the Herald manager and runs initialization (register hooks, socket handlers, menubar/bar registration) when Blacksmith API is ready.
- **`scripts/manager-herald.js`:** Core logic (camera, modes, UI hiding, auto-close windows, etc.) moved and adapted from `manager-broadcast.js`; all references to Blacksmith use `module.api` / sockets / HookManager only. No direct imports of `api-menubar.js` or internal Blacksmith modules.
- **`scripts/settings.js`:** Registration of all broadcast settings under `coffee-pub-herald`.
- **`lang/en.json`:** All broadcast-related keys.
- **`styles/broadcast.css`** (or `herald.css`): Body class `.broadcast-mode` and any broadcast-specific styles.

---

## 6. Implementation Order (When Coding Starts)

1. **Optional API in Blacksmith:** Add `renderMenubar` (or `refreshMenubar`) and, if desired, `registerMenubarVisibilityOverride`, and document them.
2. **Create Herald module:** `module.json`, entry script, `const.js` (or equivalent), empty settings and lang.
3. **Move settings and lang:** Copy broadcast settings and keys into Herald; remove from Blacksmith.
4. **Move manager logic:** Adapt `manager-broadcast.js` into Herald’s manager; switch to `game.modules.get('coffee-pub-blacksmith')?.api`, `sockets`, and HookManager; use Herald’s module ID for settings and for hook/socket registration.
5. **Register menubar and bar from Herald:** On ready, register secondary bar type `broadcast`, then `broadcast-toggle` and `broadcast-view-mode` and all secondary bar items via Blacksmith API; remove that registration from Blacksmith’s `api-menubar.js`.
6. **Menubar visibility:** Implement Option A in Blacksmith (visibility override) and have Herald register the “hide for broadcast user” check; remove the in-tree broadcast user check from `api-menubar.js`.
7. **Remove Broadcast from Blacksmith:** Drop `BroadcastManager`, broadcast settings, broadcast CSS import, and broadcast lang keys; update docs (architecture, API) to point to Herald where appropriate.
8. **Testing and docs:** Verify broadcast behavior with only Herald enabled; update user-facing docs and changelog; note “Broadcast is now provided by Coffee Pub Herald” in Blacksmith’s README or docs.

---

## 7. Summary

| Topic | Action |
|-------|--------|
| **New module** | Herald (`coffee-pub-herald`), depends on Blacksmith |
| **APIs used** | Menubar (tools, secondary bar), Sockets, HookManager; optional `renderMenubar` and menubar visibility override |
| **Moved to Herald** | All broadcast logic, settings, lang, styles; socket events remain `broadcast.*` |
| **Removed from Blacksmith** | BroadcastManager, broadcast settings, broadcast menubar/bar registration, broadcast CSS import, broadcast lang |
| **Helpers** | Herald uses its own module ID for settings; optional local or Blacksmith-utils for logging and user matching |

This migration keeps Broadcast functionality intact while making it a separate, API-driven module and clarifies the public surface that other modules (and Herald) can rely on.
