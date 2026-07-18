# Known Issues

**Audience:** module authors building against Blacksmith, and contributors.

Known defects and limitations in the current release, with workarounds. This is the counterpart to the CHANGELOG: the CHANGELOG records what was fixed; this records what is still broken. When an item is fixed it moves to the CHANGELOG and leaves this list. Each entry carries a short "Fix" pointer for whoever picks it up.

Security-sensitive issues are not listed here; they are handled privately until patched.

---

## Pins

### `update()` silently drops `shape: 'rectangle'`

Creating a pin with `shape: 'rectangle'` works, but changing an existing pin to rectangle via `pins.update()` does nothing — the update whitelist accepts only `circle`, `square`, and `none`, and drops `rectangle` with no error. Choosing "Rectangle" in the Configure Pin window (which saves through `update()`) therefore does not persist.

- **Workaround:** set the rectangular shape at `create()` time; do not switch an existing pin to rectangle via `update()` or the config UI until this is fixed.
- **Fix:** add `'rectangle'` to the whitelist in `manager-pins.js` `_applyPatch`.

### `list({ includeHiddenByFilter })` default is inverted

`pins.list()` is documented to exclude filter-hidden pins by default. An inverted check means that omitting `includeHiddenByFilter` currently *includes* them instead.

- **Workaround:** pass `includeHiddenByFilter: false` explicitly to get the documented "what the user sees on the map" set.
- **Fix:** change the guard in `manager-pins.js` from `=== false` to `!== true`.

### Three API guarantees are not yet implemented

- **`create()` does not throw on a cross-store duplicate id.** It checks only the unplaced store (for unplaced creates) or a single scene (for placed creates), so an id that already exists in the *other* store is not caught. Call `pins.exists(id)` first — it checks both.
- **`update(id, { sceneId })` and `delete(id, { sceneId })` ignore `sceneId`.** Both search unplaced-then-all-scenes regardless, so `delete` with a mismatched `sceneId` still deletes the pin. (`get()` and `exists()` do honor `sceneId`.)
- **An unplaced-created pin's tags do not reach the world tag registry** until the pin is first updated or placed.
- **Fix:** cross-store id check in `create()`; thread `sceneId` through `_findPinLocation` for `update`/`delete`; call `_addTagsToRegistry` in the unplaced-create branch.

---

## HookManager

### `once` + `debounceMs` never fires, and `throttleMs` beats `debounceMs`

On `registerHook`, combining `once` with `debounceMs` means the callback never runs: `once` removes the callback as soon as the hook fires, and removal clears the pending debounce timer before it elapses. Separately, `throttleMs` and `debounceMs` are mutually exclusive — if both are set, `throttleMs` wins and `debounceMs` is silently ignored.

- **Workaround:** use at most one of `throttleMs` / `debounceMs`, and do not pair `debounceMs` with `once`.
- **Fix:** in `manager-hooks.js`, reject (or warn on) `once`+`debounceMs` and `throttleMs`+`debounceMs`.

---

## Tags

### Runtime `register()` expects `tags`; the taxonomy JSON expects `flags`

A runtime `tags.register(contextKey, { tags: [...] })` call reads a `tags` array, but the taxonomy JSON loader reads `flags`. A runtime registration written with `flags` yields an empty taxonomy with no warning.

- **Workaround:** use `tags` in runtime `register()`; the shipped `tag-taxonomy.json` uses `flags`.
- **Fix:** accept `entry?.tags ?? entry?.flags` in both paths, then standardise the docs on `tags` (the JSON must keep accepting `flags` for the shipped file).

### `seedRegistry()` silently no-ops for players

`tags.seedRegistry(...)` returns immediately on a non-GM client with no warning, so a player-client first-run seed does not happen.

- **Workaround:** run the seed as GM. (Other registry mutations route through the GM proxy and do work for players.)
- **Fix:** the GM guard in `seedRegistry` is unnecessary — the write already routes through the GM proxy; remove the guard.

---

## Toolbar

### `visible` is ignored on the Foundry toolbar

A tool's `visible` (including a `visible: () => false` function) is honored on Blacksmith's own toolbar but not on Foundry's native token toolbar. A tool with `onFoundry: true` and `visible` false still renders on the Foundry side.

- **Workaround:** use `onFoundry` as the Foundry-side gate; don't rely on `visible` to hide a tool there.
- **Fix:** have `getFoundryToolbarTools()` honor `tool.visible`, or document `visible` as Blacksmith-toolbar-only.

### `setToolbarSettings()` does not validate `displayStyle`

`setToolbarSettings({ displayStyle })` writes the value straight to the setting without checking it against the allowed set (`none`, `dividers`, `labels`). An invalid value corrupts the setting.

- **Workaround:** pass only `none`, `dividers`, or `labels`.
- **Fix:** validate against the registered choices before writing.

---

## Canvas

### `blacksmith.CanvasLayer` can be null on the initial scene

`blacksmith.CanvasLayer` (and `window.BlacksmithCanvasLayer`) can be `null` on the first canvas after load, because the assignment runs later than the first `canvasReady`. It is also gated behind the `enableSceneClickBehaviors` setting.

- **Workaround:** use `await BlacksmithAPI.getCanvasLayer()`, which resolves the layer reliably (it falls back to reading it off the canvas). See `api-canvas.md`.
- **Fix:** assign the layer at `init` (and eagerly if the canvas is already drawn), outside the `enableSceneClickBehaviors` branch.

---

## Journal

### `createJournalEntry()` resolves to `undefined`

`api.createJournalEntry(...)` creates the journal correctly but does not return it — it resolves to `undefined` even on success, so `const e = await api.createJournalEntry(...)` gives you no handle.

- **Workaround:** find the entry afterward by the folder and name you passed (e.g. `game.journal.getName(...)`).
- **Fix:** return the created entry from each builder path in `utility-common.js`; decide what the existing-entry branches should return.
