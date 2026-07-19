# Blacksmith Core API

**Audience:** Developers of other FoundryVTT modules integrating with Coffee Pub Blacksmith. If you are working on Blacksmith itself, see `../architecture/architecture-blacksmith.md`.

This is the entry point. It covers how to reach the API, when each part becomes available, how to register your module, and what the surface contains. Each subsystem has its own reference (Pins, Toolbar, Menubar, Sockets, and so on) linked at the end.

## Two ways in

- **`game.modules.get('coffee-pub-blacksmith')?.api`** — the module API object. Use this for registration and for every namespaced surface (`pins`, `chatCards`, `campaign`, ...).
- **`BlacksmithAPI`** — a bridge with async helpers that wait for Blacksmith to finish loading:

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

const blacksmith = await BlacksmithAPI.get();   // resolves once Blacksmith is fully ready
```

There are also convenience globals (`BlacksmithUtils`, `BlacksmithConstants`, `BlacksmithHookManager`, `BlacksmithModuleManager`, `BlacksmithStats`, `BlacksmithCompendiums`). They are assigned late — see timing below.

## Availability and timing

This is the part that causes most integration bugs, so it is worth reading once.

- **`module.api` is assigned synchronously at the start of Blacksmith's `init`**, before any `await` in that hook. So by the time your `ready` handler runs, `game.modules.get('coffee-pub-blacksmith')?.api` is non-null and `registerModule`, `utils`, `version`, `BLACKSMITH`, and `stats` are usable.
- **Some members start as `null` placeholders** and are filled in later during `init`, when their dynamic imports complete: the toolbar, window, menubar, notification, and secondary-bar functions. Call these from `ready` (or after `await BlacksmithAPI.waitForReady()`), not from `init`.
- **Asset-backed data finishes during Blacksmith's `ready`**: `assetLookup` and the merged keys on `BLACKSMITH`. `api.BLACKSMITH` is the same object reference throughout — it gains keys as merges run, so a reference captured early stays valid.
- **The `window.Blacksmith*` globals are attached when `markReadyForConsumers()` runs**, near the end of Blacksmith's `ready` — not at the first line of it. `BlacksmithAPI.waitForReady()` resolves after that point.

Rule of thumb: register and read simple API members in `ready`; `await BlacksmithAPI.waitForReady()` first if you need asset-backed constants or the globals.

One known gap: `window.BlacksmithCanvasLayer` is effectively never set. Use `BlacksmithAPI.getCanvasLayer()` instead — see `api-canvas.md`.

## Quick start

### 1. Declare the dependency

```json
{
  "relationships": {
    "requires": [
      {
        "id": "coffee-pub-blacksmith",
        "type": "module",
        "manifest": "https://github.com/Drowbe/coffee-pub-blacksmith/releases/latest/download/module.json"
      }
    ]
  }
}
```

### 2. Register your module

Registration tells Blacksmith your module exists and enables inter-module features.

```javascript
Hooks.once('ready', () => {
    const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
    if (!blacksmith) return;   // Blacksmith not installed or disabled

    blacksmith.registerModule('my-module-id', {
        name: 'MYMODULE',      // short name used in logs
        version: '1.0.0'
    });
});
```

- **`my-module-id`** must match your `module.json` id exactly.
- **`name`** is a short label that makes console output easy to filter.

Related: `isModuleActive(moduleId)` and `getModuleFeatures(moduleId)`.

### 3. Guard every call

Blacksmith may be absent, disabled, or mid-load. Degrade gracefully:

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (!blacksmith?.pins?.isAvailable?.()) return;
```

## The API surface

Namespaced sub-APIs, each with its own reference doc:

| Namespace | What it does | Reference |
|---|---|---|
| `api.pins` | Canvas pins: CRUD, placement, taxonomy, events | `api-pins.md` |
| `api.chatCards` | Chat card themes and class names | `api-chatcards.md` |
| `api.campaign` | Normalized campaign context, party roster, leader | `api-campaign.md` |
| `api.compendiums` | Compendium mapping; resolve text to UUIDs | `api-compendiums.md` |
| `api.stats` | Combat and player statistics | `api-stats.md` |
| `api.sockets` | Cross-client messaging (SocketLib with native fallback) | `api-sockets.md` |
| `api.gmNotes` | GM-only notes on documents | `api-gmnotes.md` |
| `api.toast` | On-screen toast notifications | `api-toast.md` |
| `api.tags` | Shared tag vocabulary | `api-tags.md` |
| `api.uiContextMenu` | Context-menu building blocks | this document |

Function groups on `api` directly:

| Group | Functions | Reference |
|---|---|---|
| Module registration | `registerModule`, `isModuleActive`, `getModuleFeatures` | this document |
| Toolbar | `registerToolbarTool`, `unregisterToolbarTool`, `getRegisteredTools`, `getToolsByModule`, `isToolRegistered`, `getToolbarSettings`, `setToolbarSettings` | `api-toolbar.md` |
| Windows | `registerWindow`, `unregisterWindow`, `openWindow`, `getRegisteredWindows`, `isWindowRegistered`, `getWindowBaseV2`, `BlacksmithWindowBaseV2` | `api-window.md` |
| Menubar | `registerMenubarTool`, `unregisterMenubarTool`, `getRegisteredMenubarTools`, `getMenubarToolsByModule`, `getMenubarToolsByZone`, `isMenubarToolRegistered`, `renderMenubar`, `updateMenubarToolActive` | `api-menubar.md` |
| Menubar notifications | `addNotification`, `updateNotification`, `removeNotification`, `clearNotificationsByModule`, `clearAllNotifications`, `getActiveNotifications`, `getNotificationIdsByModule` | `api-menubar.md` |
| Secondary bars | `registerSecondaryBarType`, `registerSecondaryBarItem`, `registerSecondaryBarTool`, `unregisterSecondaryBarItem`, `updateSecondaryBarItemActive`, `updateSecondaryBarItemInfo`, `getSecondaryBarItems`, `openSecondaryBar`, `closeSecondaryBar`, `toggleSecondaryBar` | `api-menubar.md` |
| Canvas | `CanvasLayer`, `getCanvasLayer` | `api-canvas.md` |
| Rolls | `openRequestRollDialog` | `api-requestroll.md` |
| Encounters | `getPartyCR`, `getMonsterCR`, `parseCR`, `formatCR`, `calculateEncounterDifficulty`, `getCombatAssessment`, `deployMonsters` | this document |
| Party | `getPartyHealthSummary`, `getPartyActorHp`, `getPartyReputation`, `setPartyReputation`, `getReputationScaleEntry`, `postCurrentReputationCard`, `postNewReputationCard` | this document |
| Hooks | `BlacksmithHookManager` (global) | `api-hookmanager.md` |
| Utilities | `api.utils` | below |
| Constants | `api.BLACKSMITH`, `BlacksmithConstants` (global) | below |

The `test*` members on the API (`testMenubarAPI`, `testNotificationSystem`, and similar) are Blacksmith's own development helpers. They are not a supported contract; do not build against them.

## Utilities (`api.utils`)

Also available as the `BlacksmithUtils` global once Blacksmith is ready.

| Function | Signature | Notes |
|---|---|---|
| `postConsoleAndNotification` | `(moduleId, message, result, debug, notification)` | Console logging; `debug: true` logs only when Blacksmith debug is on, `notification: true` also shows a UI toast |
| `playSound` | `(sound, volume?, loop?, broadcast?, duration?)` | See below |
| `getSettingSafely` | `(moduleId, settingKey, defaultValue)` | Never throws on an unregistered setting |
| `setSettingSafely` | `(moduleId, settingKey, value)` | Async |
| `formatTime` | `(ms, format)` | `format` defaults to `"colon"` |
| `generateFormattedDate` | `(format)` | `format` is an enum, not a pattern: `'date'`, `'time'`, or anything else for both. Values are not zero-padded |
| `trimString` | `(str, maxLength)` | |
| `toSentenceCase` | `(str)` | |
| `markdownToHtml` | `(text)` | Subset only, see below |
| `htmlToMarkdown` | `(html)` | Subset only, see below |
| `getActorId` | `(actorName)` | |
| `getTokenId` | `(tokenName)` | |
| `getTokenImage` | `(tokenDoc)` | |
| `getPortraitImage` | `(actor)` | |
| `objectToString` | `(obj)` | |
| `stringToObject` | `(str)` | Parses `key=value\|other=data` |
| `convertSecondsToRounds` | `(numSeconds)` | |
| `convertSecondsToString` | `(numSeconds)` | e.g. `"1 HR (600 ROUNDS)"` |
| `clamp` | `(value, min, max)` | |
| `rollCoffeePubDice` | `(roll)` | Async |
| `resetModuleSettings` | `(moduleId)` | |
| `isPlayerCharacter` | `(entity)` | |

```javascript
const utils = game.modules.get('coffee-pub-blacksmith')?.api?.utils;

utils.postConsoleAndNotification('my-module-id', 'Registered', { count: 3 }, false, false);

const theme = utils.getSettingSafely('my-module-id', 'cardTheme', 'theme-default');
```

### `playSound(sound, volume?, loop?, broadcast?, duration?)`

- **sound** — a path, or a constant such as `BlacksmithConstants.SOUNDNOTIFICATION01`. `'none'` / `'sound-none'` does nothing.
- **volume** — 0 to 1, default `0.7`.
- **loop** — default `false`.
- **broadcast** — default `true` (all clients); `false` plays locally only.
- **duration** — optional seconds. If set, the sound loops for that long then stops, on all clients when broadcasting.

`playSoundLocalWithDuration` is exported from `scripts/api-core.js` but is not on `api.utils`, so `utils.playSoundLocalWithDuration` is `undefined`. For local playback with a timed stop, call `playSound(sound, volume, false, false, duration)` — that is what it does internally.

### Markdown subset

`markdownToHtml` / `htmlToMarkdown` handle a deliberately small subset; anything else is treated as plain text: `#`/`##`/`###` headings, `---` rules, `**bold**`, `*italic*`, `-`/`*` unordered lists, `1.` ordered lists, and `>` blockquotes.

## Constants

Read constants from the `BlacksmithConstants` global (or `api.BLACKSMITH`). `COFFEEPUB` is an internal export of `scripts/api-core.js` and is **not** exposed to other modules — do not reference it.

- **Sounds** — `BlacksmithConstants.SOUNDNOTIFICATION01`, `SOUNDBUTTON01`, and similar.
- **Volumes** — `SOUNDVOLUMESOFT`, `SOUNDVOLUMENORMAL`, `SOUNDVOLUMELOUD`, `SOUNDVOLUMEMAX`. These resolve to the numeric string the entry carries (e.g. `"0.5"`), which you can pass straight to `playSound`.
- **Icons** — `ICONNONE`, `ICONCHESSQUEEN`, and others defined by `resources/asset-defaults/assets-icons.json`. Run `BlacksmithAPIConstants()` in the console for the current list rather than trusting a written example.
- **Choice maps** — `arrThemeChoices`, `arrSoundChoices`, `arrTableChoices`, `arrMacroChoices`. Despite the `arr` prefix these are plain objects (`{ value: label }`) shaped for a Foundry `choices` map. `.length` is `undefined`; use `Object.keys()`.

Chat card themes are not in `BlacksmithConstants` — use the chat cards API (`api-chatcards.md`).

Request Roll presentation assets (its cinematic overlay and sounds) are feature-local to Blacksmith, driven by `themes/request-roll/theme-requestroll.json`. They are not part of the shared constants contract.

For tag-based asset searching, reach the lookup through the API object:

```javascript
const blacksmith = await BlacksmithAPI.get();
const sounds = blacksmith.assetLookup.searchByCriteria({ type: 'sound', tags: ['notification'] });
```

## Patterns

**Feature detection** — check for what you use, not for a version:

```javascript
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;
if (blacksmith?.registerToolbarTool) {
    blacksmith.registerToolbarTool('my-tool', { /* ... */ });
}
```

**Waiting for asset-backed data:**

```javascript
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';

Hooks.once('ready', async () => {
    await BlacksmithAPI.waitForReady();
    const sound = BlacksmithConstants.SOUNDNOTIFICATION01;   // globals are attached by now
});
```

**Cleanup** — Foundry has no module-unload event, and disabling a module reloads the world, so there is no teardown hook to register. Call any unregister methods from your own lifecycle if you turn a feature off at runtime. See `api-hookmanager.md`.

## Console commands

Run these in the browser console to inspect an integration:

| Command | Shows |
|---|---|
| `BlacksmithAPICheck()` | Overall integration check |
| `BlacksmithAPIStatus()` | API readiness status |
| `BlacksmithAPIVersion()` | Blacksmith API version |
| `BlacksmithAPIModules()` | Registered modules |
| `BlacksmithAPIFeatures()` | Registered features |
| `BlacksmithAPIConstants()` | Current constants |
| `BlacksmithAPIUtils()` | Available utilities |
| `BlacksmithAPISettings()` | Settings snapshot |
| `BlacksmithAPIAssetLookup()` | Asset lookup state |
| `BlacksmithAPIDetails()` | Detailed API dump |
| `BlacksmithAPIHooks()` / `BlacksmithAPIHookDetails()` / `BlacksmithAPIHookStats()` / `BlacksmithAPIHookExpandedDetails()` | Hook registrations (see `api-hookmanager.md`) |
| `BlacksmithAPIManualReady()` | Force the ready signal (debugging only) |

## Troubleshooting

**`api` is null.** You are running in `init` before Blacksmith's `init` assigned it, or Blacksmith is not installed. Move the call to `ready`, and guard with `?.`.

**A function is `null` rather than missing.** The toolbar, window, menubar, notification, and secondary-bar members start as `null` placeholders and are filled during `init`. Call them from `ready`.

**A constant is `undefined`.** Asset-backed constants finish loading during Blacksmith's `ready`. `await BlacksmithAPI.waitForReady()` first, then read.

**A global (`BlacksmithUtils`, `BlacksmithConstants`, ...) is undefined.** Same cause — globals attach when `markReadyForConsumers()` runs late in `ready`. Await `waitForReady()`.

**`.length` on a choice array is `undefined`.** The `arr*` choice maps are objects, not arrays. Use `Object.keys()`.

**Settings throw "not registered".** Use `getSettingSafely` / `setSettingSafely`, and register settings that depend on Blacksmith API data inside `ready` (awaiting your own registration) rather than `init`.

**Your module never appears in `BlacksmithAPIModules()`.** `registerModule` was not called, ran before `ready`, or the id does not match your `module.json`.

## Related documentation

- Subsystem references: `api-pins.md`, `api-toolbar.md`, `api-window.md`, `api-menubar.md`, `api-sockets.md`, `api-chatcards.md`, `api-stats.md`, `api-campaign.md`, `api-compendiums.md`, `api-requestroll.md`, `api-gmnotes.md`, `api-canvas.md`, `api-hookmanager.md`, `api-tags.md`, `api-toast.md`
- Internal architecture: `../architecture/architecture-blacksmith.md`
