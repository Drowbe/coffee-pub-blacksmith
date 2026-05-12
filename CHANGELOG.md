# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [13.7.3]

### Added

- **Manage Pins window taxonomy controls** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`, `scripts/manager-pins.js`): Added section-level visibility toggles so GMs can hide or show whole pin groups such as Global, Custom, and registered pin categories, not just individual tags. Type-scoped tag visibility is now saved in visibility profiles via `hiddenTypeTags`.
- **Manage Pin Tags bulk selection flow** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Added browse-tab select mode with row checkboxes, selected count, **Select Visible**, **Clear**, and **Bulk Edit Tags** actions in the window action bar. The **Done** control remains in the top toolbar.
- **Bulk Edit Pin Tags Application V2 window** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Added a resizable Blacksmith V2 bulk tag editor for selected pins. It starts with the union of all selected pin tags, shows tag chips with per-selection counts, supports typed tag entry, and includes **Update** plus **Delete All Tags** actions.
- **Manage Custom Pin Tags Application V2 window** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`, `scripts/manager-pins.js`, `scripts/api-pins.js`): Added a dedicated GM window for custom pin tag administration. It lists custom tags with current-scene usage, global usage, and pin types, and supports **Rename**, **Scene**, **All Scene**, and icon-only delete actions with `data-tooltip` explanations.
- **Registry-only custom pin tags** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`, `scripts/api-pins.js`, `documentation/api/api-pins.md`): Added **Add** support in Manage Custom Pin Tags for adding one or more comma-separated tags to the registry without assigning them to pins. New API methods include `addTagToRegistry`, `stripTagFromScene`, and `stripTagFromAllScenes`.

### Changed

- **Pin manager naming and layout** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Renamed **Pin Layers** to **Manage Pins**, **Layers** to **Manage Pin Layers**, and **Browse** to **Manage Pin Tags**. Tabs and search/profile controls now render as separate tool rows with their own padding and divider.
- **Manage Pin Layers scope cleanup** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Removed the pencil/manage mode and global tag mutation controls from the layer taxonomy tab so the tab now focuses on visibility only. Custom tag mutations moved into the dedicated Manage Custom Pin Tags window.
- **Manage Pin Layers global taxonomy grouping** (`scripts/window-pin-layers.js`): Consolidated the separate top **Global** and bottom **Custom** tag groups into one **Global** section with **System** and **Custom** subsections, matching the layout used by registered pin categories.
- **Custom tag action labels** (`scripts/window-pin-layers.js`): Shortened custom tag row actions to compact labels: **Rename**, **Scene**, **All Scene**, and icon-only delete. Full explanations moved to `data-tooltip` attributes.
- **Bulk tag editor visual consistency** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Aligned bulk tag chips with the shared `.blacksmith-tag` styling used by the main pin manager tag clouds.
- **Tag registry operations preserve strip/delete distinction** (`scripts/manager-pins.js`): Strip actions remove tag usage while keeping the tag available in the registry; delete removes both usage and registry entries.
- **Manage Pin Layers profile workflow** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Saved profiles now auto-apply when selected, replacing the ambiguous **Apply** button. The profile row now uses dropdown-based **+ New Profile**, conditional **Update**, a compact delete icon with confirmation, and an **Active / Unsaved Changes / Custom** status chip.
- **Manage Pin Layers built-in profiles** (`scripts/window-pin-layers.js`): Added permanent **All Pins** and **No Pins** system profiles to the profile selector. They apply immediately, cannot be updated or deleted, and map to the hide-list model: **All Pins** clears all hidden state, while **No Pins** hides all current pin layers/tags and uses hide-all so future pins remain hidden too.
- **Manage Pin Layers profile dropdown organization** (`scripts/window-pin-layers.js`): Reordered the profile dropdown into **+ New Profile**, **System**, and **Custom** sections. Creating profiles now starts from the dropdown, while custom profile updates/deletes remain contextual to the selected custom profile.
- **Manage Pin Layers taxonomy labels** (`scripts/window-pin-layers.js`): Renamed taxonomy subsection labels from **Predefined** to **System** for consistency with the profile dropdown and built-in tag language.
- **Pins menubar context menu** (`scripts/utility-core.js`, `scripts/api-menubar.js`): Replaced the legacy right-click pin menu with a focused set of actions: **Manage Pins**, **Hide All Pins**, **Show All Pins**, and **Load Profile** with saved custom profiles in a flyout. Bulk deletion and detailed pin-layer operations now live in the Manage Pins window.

### Fixed

- **Bulk tag editor tag coverage** (`scripts/window-pin-layers.js`): Bulk editing now accounts for all selected pin tags, including custom/non-taxonomy tags, so existing tags like scene-local custom tags appear in both the input and chip suggestions.
- **Global tag rename/delete cleanup** (`scripts/manager-pins.js`): Global rename and delete now also handle unplaced pins, type-scoped hidden tag state, and saved visibility profile snapshots.
- **Bulk editor chip interaction** (`scripts/window-pin-layers.js`): Hardened listener attachment so tag chips continue to toggle correctly when Application V2/Dialog root elements differ.
- **Manage Pin Layers profile state clarity** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`): Profile controls now more clearly represent the saved visibility snapshot: hide-all state, hidden categories, hidden global tags, and hidden type-scoped tags. Selecting **Custom / Current View** clears the active profile label without changing the current layer visibility.
- **Menubar profile synchronization** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`, `scripts/api-menubar.js`, `scripts/api-pins.js`): Manage Pins now prefers the active profile set by the menubar over stale window history. Profile application accepts scene context through the public pins API so saved profile repair logic can evaluate the correct scene.
- **No Pins profile customization** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`): Showing a category or tag after starting from **No Pins** now clears the global hide-all flag before un-hiding the chosen layer, preventing profiles that look visible in the manager while remaining hidden on the canvas. Older custom profiles with visible layer exceptions under hide-all are repaired on apply and can be updated afterward.
- **Manage Pins hook and timer cleanup** (`scripts/window-pin-layers.js`): Routed persistent Manage Pins lifecycle hooks through `HookManager`, limited scene-load profile refreshes to system profiles, and cleared pending browse-search debounce timers when the window closes.
- **Registered pin type filtering** (`scripts/manager-pins.js`, `scripts/window-pin-layers.js`): Type taxonomy tags such as Note, Codex, Quest, Objective, and Artificer component tags are now evaluated against their registered module/type visibility instead of being overridden by stale global hidden-tag state.

## [13.7.2]

### Added

- **Portrait Image Source setting for targeter portraits** (`settings.js`, `lang/en.json`, `manager-token-indicators.js`): New **Portrait Image Source** dropdown in the Targeted Indicator section lets GMs choose what image appears in the portrait bubble above a targeted token. Three options: **Character Portrait** (actor portrait image, default), **Character Token** (canvas token art), and **Player Avatar** (user avatar). Changing the setting live-redraws all portraits immediately.

### Changed

- **Targeter portraits now resolve from the controlled token, not just the assigned character** (`manager-token-indicators.js`): A new `controlToken` hook tracks the last token each user controlled on the canvas. Portrait images now derive from that source token rather than always using the user's primary assigned character. This means players who own multiple characters will see the correct portrait for whichever character they have selected, and the fallback chain (actor portrait → user avatar → mystery-man) still applies when no controlled token is found.

### Fixed

- **Target indicators persisted after token deletion** (`manager-token-indicators.js`): The `deleteToken` hook callback used the Foundry v10 signature `(scene, tokenData)` which in v11+ became `(tokenDocument, options)`. The second argument (options) has no `id`, causing the early-return guard to silently skip all cleanup. Ring graphics, ticker animations, and internal state all remained on the canvas after a token was deleted. Fixed by updating the callback to `(tokenDocument)` so cleanup runs correctly.

## [13.7.1]

### Added

- **Pin context menu — GM Access submenu** (`scripts/pins-renderer.js`): Added a GM-only **Access** submenu on pin right-click with `None: GM Only`, `Read Only: All open / GM Edit`, `Pin: All see pin / GM and Owner Edit`, and `Full: All view and edit`. Each action updates both `ownership.default` and `config.blacksmithAccess` so context-menu edits match Configure Pin behavior.
- **Pin visibility modes include Owner** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`, `scripts/pins-renderer.js`, `scripts/window-pin-layers.js`): Added `owner` as a third visibility mode (`visible` / `hidden` / `owner`) in Configure Pin, renderer visibility checks, right-click visibility submenu, and Pin Layers browse toggle cycle.

### Changed

- **Configure Pin permissions model decoupled into Access + Visibility** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`): Replaced legacy ownership labels with explicit access presets (`None`, `Read Only`, `Pin`, `Full`) and separate `Visibility` control (`Visible`, `Hidden`, `Owner`). Access presets map to Foundry ownership + `blacksmithAccess` runtime mode.
- **Pin Layers browse visibility toggle cycles all three states** (`scripts/window-pin-layers.js`): Browse row visibility action now rotates `Visible -> Hidden -> Owner -> Visible` with matching icon/title updates.

### Fixed

- **GM-only access now enforces hidden visibility** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`): Selecting `None: GM Only` now forces `Visibility=Hidden`, disables visibility editing in the form, and re-enforces `blacksmithVisibility='hidden'` on save to prevent invalid combinations.
- **Pin interaction lock for non-editors in Pin mode** (`scripts/pins-renderer.js`, `styles/pins.css`): `blacksmithAccess='pin'` now allows players to see pins but blocks click/drag/context interactions unless they are GM or owner/editor. Locked pins also use a non-interactive cursor affordance.
- **Pin config header portrait clipping regression (Application V2 migration)** (`styles/window-pin-config.css`): Restored header preview image to fill/crop inside the circular placeholder (`object-fit: cover`, circular clipping), matching pre-migration behavior.

## [13.7.0]

### Added

- **Unified Tags system** (`manager-tags.js`, `api-tags.js`, `settings.js`, `blacksmith.js`): New module-agnostic labeling infrastructure exposed at `game.modules.get('coffee-pub-blacksmith').api.tags`. Any coffee-pub module can register a taxonomy for its data types and attach, query, rename, or delete tags through a single shared API. Tags are stored centrally in a new world setting `tagAssignments` keyed by `{moduleId}.{dataType}` context key and record ID. A world-level `tagRegistry` tracks every tag ever used across all contexts. Full method surface: `setTags`, `getTags`, `addTags`, `removeTags`, `deleteRecordTags`, `getRecordsByTag`, `getChoices`, `getRegistry`, `normalize`, `rename`, `delete`, `seedRegistry`, `setVisibility`, `getVisibility`, `register`. Rename and delete propagate atomically across all records in all contexts. GM-only mutations route through the existing SocketLib GM proxy so non-GM players can tag records they own. Protected tags (marked `protected: true` in the taxonomy) cannot be renamed or deleted via the API.
- **Unified tag taxonomy** (`resources/tag-taxonomy.json`): Single JSON file that defines tag choices for all coffee-pub module contexts — `coffee-pub-blacksmith.journal-pin`, `coffee-pub-squire.note/codex/quest/objective`, and `coffee-pub-artificer.habitat-location/component-location/skill-location`. Replaces per-system taxonomy registration. An optional world setting `tagTaxonomyOverrideJson` accepts a path to a merge-override file. A pin-taxonomy.json compatibility shim ensures existing pin contexts load correctly during the migration window.
- **TagWidget** (`widget-tags.js`, `templates/partials/tag-widget.hbs`, `styles/widget-tags.css`): Reusable embeddable UI component for Application V2 windows. Full mode supports display, add, remove, and live-search against taxonomy suggestions. Filter mode renders visibility toggles for sidebar filter panels. Embed via `TagWidget.prepareData()` → `{{> blacksmith-tag-widget}}` → `TagWidget.readValue()` on save. `TagWidget.activate()` wires all interactivity after render.
- **Pin tag mirroring into central store** (`manager-pins.js`): Pin create, update, and delete operations now mirror tag data into `tagAssignments` via `_mirrorTagsForPin` and `_clearTagsForPin` helpers. All five write paths are covered: placed create, unplaced create, placed update, unplaced update, and the unplaced→placed transition. Tag data remains on `pin.tags[]` as the authoritative source during the migration window.
- **One-time pin tag backfill** (`manager-pins.js`, `settings.js`): `PinManager.backfillFlagAssignments()` runs once on first GM load to populate `tagAssignments` from all existing `pin.tags[]` across every scene and the unplaced store. Builds the full assignments object in a single in-memory pass and writes it in one settings call. Gated by `tagsAssignmentsMigrated` sentinel; merges with any forward-writes already present rather than overwriting.
- **One-time registry migration** (`manager-tags.js`): `TagManager.runMigration()` seeds `tagRegistry` from the existing `pinTagRegistry` on first GM load, preserving the world's entire tag vocabulary without any manual steps. Backward-compatible with worlds that ran under the previous `flag*` naming — detects old sentinels and copies data across automatically.

### Changed

- **Journal pin tag chips use Tags API** (`ui-journal-pins.js`): `_populateTagChips` now calls `tags.getChoices('coffee-pub-blacksmith.journal-pin')` filtered to taxonomy-tier entries instead of `pins.loadBuiltinTaxonomy()` + `pins.getPinTaxonomy()`. The async taxonomy load is removed from the toolbar render path since `TagManager` loads at init.
- **Pin configuration window Suggested/Other tags use Tags API** (`window-pin-configuration.js`): Tag group population replaced `PinManager.ensureBuiltinTaxonomyLoaded()` + `PinManager.getPinTaxonomyChoices()` + `PinManager.getPinTaxonomy()` + `PinManager.getTagRegistry()` with `tags.getChoices(contextKey)` (taxonomy tier only for Suggested) and `tags.getRegistry()` (for Other). Custom scene-local tags scan is unchanged. `pinClassificationHelp` now falls back directly to `pinTypeLabel` since `taxonomyChoices.label` was redundant.
- **`pins.getTagRegistry()` delegates to canonical store** (`api-pins.js`): Returns `TagManager.getRegistry()` (the authoritative `tagRegistry` world setting) with a fallback to `PinManager.getTagRegistry()` during the migration window. Callers using the old pins API surface now read from the unified store.
- **`pins.setTagVisibility()` syncs to Tags system** (`api-pins.js`): In addition to updating `pinsHiddenTags` for pin rendering, now also calls `TagManager.setVisibility()` so visibility state is consistent across both systems.

### Fixed

- **`renameTagGlobally` early-return prevented `tagAssignments` update** (`manager-pins.js`): The method had an early return when the tag was not present in `pinTagRegistry`. Tags added via `tags.setTags()` are written to `tagRegistry` but not `pinTagRegistry`, so renames called through the pins API never reached the `TagManager.rename()` call. Fixed by moving the `TagManager.rename()` call before the registry guard so it always runs regardless of pin registry state.
- **`deleteTagGlobally` and `renameTagGlobally` did not update `tagAssignments`** (`manager-pins.js`): GM tag management operations via the existing Pin Layers UI updated `pin.tags[]` on all scenes but left `tagAssignments` stale. Both methods now mirror the operation into the central store via `TagManager.delete()` and `TagManager.rename()` respectively.

## [13.6.6]

### Added

- **Targeter portraits above tokens** (`manager-token-indicators.js`, `settings.js`, `lang/en.json`): When one or more players have a token targeted, small portraits of those players now float above the token on the canvas. Each portrait shows the player's character image (falling back to their user avatar), clipped to the chosen shape with a colored border ring in their player color. Portraits stack horizontally, centered above the token, and update in real time as targeting changes. Three new settings appear in the Targeted Indicator section: **Show Targeter Portraits** toggle (enabled by default), **Portrait Shape** dropdown (Circle or Rounded Square), and **Portrait Size** slider (1–10, default 5). Size scales proportionally to the scene grid so portraits look correct at any grid resolution or zoom level.
- **Manual Rolls button in sidebar** (`ui-sidebar-style.js`, `sidebar-pin.css`, `lang/en.json`): A new button appears in the sidebar below the pin button, labeled "Manual Rolls" (or "Manual Rolls: Enabled" / "Manual Rolls: Disabled" when toggled). Clicking it toggles the manual rolls setting for all dice, with a confirmation message. The button icon changes to **`fa-solid fa-dice`** when enabled and **`fa-solid fa-dice-d20`** when disabled. The button is only visible for GMs.


## [13.6.5]

### Added

- **Hide/Show UI — per-region controls** (`utility-core.js`, `settings.js`, `lang/en.json`): Replaced coarse “hide left / hide bottom” with five user toggles (Toolbar `#ui-left-column-1`, Scene Controls `#ui-left-column-2`, Online Players `#players`, Macro Hotbar `#hotbar`, Floating Chat `#chat-notifications`). Hide/Show, **Apply on Load**, and the module hotkey only affect regions marked as included.
- **Manage UI start menu** (`utility-core.js`): **Hide UI** / **Show UI** plus an **Options** submenu (Apply on Load and each **Include …** line). Mirrors the Canvas settings; `_uiSuppressed` keeps DOM in sync when include flags change from the settings sheet (`updateSetting` / `clientSettingChanged`).
- **Toggle Hide/Show Interface keybinding** (`utility-core.js`, `lang/en.json`): Registered on `init` for Configure Controls (default **Ctrl+I**; moved from Ctrl+U to avoid browser View Source conflicts).
- **Start menu hotkey labels** (`utility-core.js`): **Hide UI** / **Show UI** and **GM Quickview On/Off** append the live shortcut from `game.keybindings.get()` (e.g. `Hide UI (ctrl + i)` and `GM Quickview Off (ctrl + q)`). `getKeybindingDisplayLower` now normalizes Control to **`ctrl`**.
- **Nested menubar context menus** (`api-menubar.js`): `_mapMenubarContextMenuItem` maps submenus recursively so **Manage UI → Options** renders correctly.
- **Request movement mode** (`token-movement.js`, `manager-sockets.js`): New movement type **`request-movement`**. When a non-GM moves a token, a dialog asks whether to request approval (**Cancel** / **Request Move**); the GM gets an allow/deny prompt and approved moves are applied on the GM client (`_gmApplyingApprovedRequestMove` bypass in `preUpdateToken`). If the GM declines, the player is notified. Socket events **`movementRequestAskGM`** and **`movementRequestDenied`** are registered with dynamic `import('./token-movement.js')` so handlers stay on the GM / clients without circular imports.

### Fixed

- **`renderChatMessage` remap** (`manager-hooks.js`, `coffee-pub-prototype/scripts/prototype.js`): `HookManager.registerHook` still remaps **`renderChatMessage` → `renderChatMessageHTML`** for v13+ compatibility; remap hints use a **single `console.warn` per session** (no UI notification spam). Prototype API test uses **`renderChatMessageHTML`** and `(message, html, context)`.
- **Leader vote tie-breaker DialogV2** (`manager-vote.js`, `vote.css`): Tie dialog reads the select from **`button.form`** / `dialog.element` (DialogV2 often has `dialog.form` null, so the GM button appeared to do nothing). **`VoteManager`** is referenced explicitly in the callback; **`try` / `finally`** always closes the dialog. Replaced oversized `<h3>` with intro copy + label, added **`blacksmith-leader-tie-breaker`** styles for readable body text and footer button contrast.
- **Leader vote tie — `activeVote` cleared too early** (`manager-vote.js`): After all votes were in, **`closeVote()`** ran **`_calculateResults()`** (which opens the GM tie dialog) but then immediately nulled **`activeVote`** and told other clients the vote closed. Choosing a leader then hit “no active vote.” **`closeVote`** / **`receiveVoteClose`** now pass **`pendingLeaderTieBreaker`** and keep **`activeVote`** until the GM finishes the tie dialog (or a non-tie close), then the usual close path clears state.
- **Manage UI include toggles not applying while hidden** (`utility-core.js`): In **Manage UI → Options**, toggling an **Include …** line now applies immediately when Hide UI is currently active (uses current hidden state plus `_uiSuppressed`), instead of waiting for a later global hide/show click.
- **Start menu Heap helper line removed** (`utility-core.js`): Removed the redundant "Left hamburger menu only..." description from the Heap row; the numeric heap display remains clickable for the full performance report.
- **Deprecated global `KeyboardManager`** (`utility-core.js`, `utility-quickview.js`, `blacksmith.js`): Read `foundry.helpers.interaction.KeyboardManager` instead of the global shim (v13 deprecation warning).
- **Request Roll cinematic button crash** (`window-skillcheck.js`): Fixed `TypeError: Cannot read properties of null (reading 'closest')` in cinematic roll button clicks by capturing `event.currentTarget` before async work and adding a null guard before calling `.closest(...)`.
- **Async click handler hardening** (`window-skillcheck.js`, `manager-vote.js`, `window-vote-config.js`, `token-movement.js`): Added defensive `currentTarget` element guards in async UI handlers to prevent null/invalid-target runtime errors during delayed event flows.
- **Token indicators persist after token delete** (`manager-token-indicators.js`): Added `deleteToken` cleanup to remove turn/target indicator graphics and purge deleted token IDs from indicator tracking sets/maps so stale rings never remain on canvas.
- **Quick View overlays persist after token delete** (`utility-quickview.js`): Added `deleteToken` cleanup to remove tracked quickview overlays and hatch IDs for deleted tokens, then re-run visibility/overlay scheduling to keep the canvas clean.

### Changed

- **Dialogs migrated to Application V2 (`DialogV2`)** (`utility-common.js`, `token-movement.js`, `manager-vote.js`, `window-vote-config.js`, `api-menubar.js`, `window-pin-layers.js`, `window-stats-party.js`, `window-pin-configuration.js`, `window-gmtools.js`): Replaced legacy `new Dialog` / `Dialog.confirm` with `foundry.applications.api.DialogV2` (static `confirm` / `wait` where appropriate, instance dialogs with explicit `close()` for forms). Clipboard fallback uses a DOM-built textarea so pasted text is not parsed as HTML. Menubar timer and leader prompts no longer nest `<form>` inside DialogV2’s wrapper form.
- **Directory JSON import windows (`BlacksmithWindowBaseV2`)** (`blacksmith.js`, `window-json-import.js`, `window-json-import.hbs`, `window-json-import.css`): Journal, Item, Roll Table, and Actor directory **Import** flows now use a shared Application V2 Blacksmith window with the standard Blacksmith header, fixed chrome title **Import JSON**, and per-window header titles (**Import Journal / Item / Roll Table / Actor**). Layout was refined into two sections (template copy + import), with full-height paste area, action-bar buttons (**Select JSON File** secondary-left, **Import JSON** primary-right), and no redundant close button. Item import icon uses **`fa-briefcase`**.
- **Fastest Path — chat parity with Conga** (`token-movement.js`): Removed per-leader-move `calculateMarchingOrder(..., postToChat: true)` after follower processing (previously only Conga skipped that path). Follower **blocked / too-far** recalculation now uses **`postToChat: false`**. Marching-order chat cards match Conga frequency: mode change / leader setup / `handleTokenOrdering`, not every drag.
- **Token movement — labels, icons, and Request UX** (`token-movement.js`, `api-menubar.js`, `manager-sockets.js`, `templates/menubar.hbs`, `movement-window.hbs`, `cards-common.hbs`, `lang/en.json`): Modes renamed to **Wander**, **Locked**, **Combat**, **Conga**, and **Fastest Path** (replacing older “Free / Movement Locked / Combat Mode / Conga Movement / Fastest Path Movement” wording). Combat mode icon is **`fa-person-harassing`**; Fastest Path uses **`fa-person-running`**; **Request** uses **`fa-person-circle-question`**. Movement chips and config use **`fa-solid …`** for Font Awesome 6. **`preUpdateToken`** treats any `extractMovementSubset` change (position, elevation, rotation, size) as movement. Request dialogs show the question icon in the body; GM dialog uses the same icon treatment and **`fa-solid`** for Yes/No.
- **Canvas settings copy** (`lang/en.json`): Canvas section hint documents Configure Controls for **Toggle Hide/Show Interface** and points users at the granular include toggles.
- **Release packaging includes theme assets** (`.github/workflows/release.yml`): Added `themes/` to the release zip so Request Roll theme JSON, images, and sounds are shipped with tagged releases.
- **Release packaging includes changelog file** (`.github/workflows/release.yml`): Added `CHANGELOG.md` to the release zip to match the `module.json` changelog reference.


## [13.6.4]

### Added

- **Pin taxonomy API — `getModuleTaxonomy(moduleId)`** (`manager-pins.js`, `api-pins.js`): New public method returns a module's full taxonomy as `{ [type]: { label, tags } }`. Allows other modules to read their registered pin types and tags without needing to know internal registry keys.
- **Pin taxonomy — type-scoped tag visibility** (`manager-pins.js`, `settings.js`): New client setting `pinsHiddenTypeTags` (`object`) stores hidden state per `moduleId|type|tag` key, separate from the existing global `pinsHiddenTags`. New methods: `isTypeTagHidden`, `setTypeTagHidden`, `clearTypeTagHiddenState`. Toggling a tag in a type group no longer bleeds into the same tag name in another type's group.
- **Pin Layers — TAXONOMY section** (`window-pin-layers.js`, `window-pin-layers.css`): Replaced the flat CATEGORIES + TAGS layout with a single TAXONOMY section. Tags are grouped by type (one group per registered pin type), each showing a **Predefined** subsection (taxonomy-defined tags) and a **Custom** subsection (registry orphan tags + scene-local custom tags). A **Global** group shows the top-level `globalTags` from the JSON. A **Custom** catch-all group at the bottom shows all orphan registry tags.
- **Manage Custom Pin Tags window** (`window-pin-layers.js`, `window-pin-layers.css`): New Application V2 window for GM custom pin tag administration. It lists each custom tag with current-scene usage, global usage, pin types, and explicit actions for **Rename Globally**, **Strip From Current Scene**, **Strip From All Scenes**, and **Delete Globally**. GMs can also add registry-only custom tags before any pin uses them.
- **Pin Layers — tag counts always visible** (`window-pin-layers.js`): Every tag chip now shows a scene-pin count. Predefined tags with zero matching pins render with a dashed border (`is-empty`). Custom tags from the orphan registry that have been stripped from all scene pins remain visible with count 0 rather than disappearing.
- **Configure Pin — Suggested / Other tag groups** (`window-pin-configuration.js`, `window-pin-config.hbs`, `window-pin-config.css`): The flat tag chip list is split into two labeled sections. **Suggested** shows the current pin type's taxonomy tags plus custom tags found on scene pins of that type. **Other** shows global tags, other types' taxonomy tags, and orphan registry tags — all in one flat group. Both groups toggle tags into the Tags input identically.

### Fixed

- **Pin taxonomy — `PIN_TYPE` lazy getter** (`ui-journal-pins.js`): Replaced the hardcoded `static PIN_TYPE = 'journal-pin'` with a lazy getter that reads the first key from `getModuleTaxonomy(MODULE.ID)` at runtime. The JSON key is now the authoritative source; changing the key in `pin-taxonomy.json` propagates automatically without code changes.
- **Pin taxonomy — hardcoded tags removed from `_registerJournalTaxonomy`** (`ui-journal-pins.js`): The tag array `['journal', 'location', 'shop', ...]` was being merged into the taxonomy on every registration, overriding the JSON. Removed entirely; taxonomy now comes solely from `loadBuiltinTaxonomy` / `pin-taxonomy.json`.
- **Pin Layers — unified tag chip CSS** (`window-pin-layers.js`, `window-pin-layers.css`): The tag cloud was overriding `.blacksmith-tag` with `all: unset` and forcing orange-by-default, diverging from the global design system. Removed the override; tag chips now use the shared `.blacksmith-tag` / `.blacksmith-tag.active` styles from `window-form-controls.css`. Active (visible) tags render orange; inactive (hidden) tags render neutral — matching the Pin Configuration window.

### Changed

- **Pin Layers — tag chip active state inverted** (`window-pin-layers.js`): Tag chips now use `.active` when the tag is *visible* (click to hide) and no modifier when *hidden* (click to show), consistent with the global `.blacksmith-tag` convention used in Pin Configuration.
- **Pin Layers — custom tag administration moved out of layers** (`window-pin-layers.js`): Removed the pencil/manage mode from the **Manage Pin Layers** tab so that tab stays focused on visibility filters. Custom tag mutations now live in the dedicated **Manage Custom Pin Tags** window.

## [13.6.3]

### Added

- **Journal toolbar — tag selector** (`ui-journal-pins.js`, `templates/toolbar-pins.hbs`, `styles/journal-pins.css`): A tag chip row now appears below the icon row in the journal "Pin Page" toolbar. Tags are populated from the registered `journal-pin` taxonomy (via `getPinTaxonomy`, not the global choice set) so only the relevant tags appear. Chips default to unchecked; multiple may be selected. Selected tags are collected and passed to `_ensurePin` / `_beginPlacement` on click.
- **Journal toolbar — state restore on open** (`ui-journal-pins.js`): When a journal sheet opens or the active page changes, `_restoreBarState` looks up the page's linked pin and pre-selects the matching icon button and tag chips. Defaults the **narrative** tag chip when no saved state exists (new page or pin has no tags).
- **Pin Layers — per-pin Browse actions** (`window-pin-layers.js`): Browse view now shows per-pin action buttons for Player Visibility (eye toggle), Configure (gear), and Delete (danger icon) next to each pin row. GM-only.
- **Pin Layers — "Delete All" action bar button** (`window-pin-layers.js`): GM-only "Delete All" button added to the action bar left zone in the Layers window, replacing the bulk-delete items that were removed from the context menu.
- **Configure Pin — Player Visibility field** (`window-pin-configuration.js`, `window-pin-config.hbs`): `config.blacksmithVisibility` (`'visible'` / `'hidden'`) is now editable in the Permissions section alongside the ownership dropdown. Separate from ownership — a pin can have player-observable ownership but be hidden from the map. Player Visibility is included in Update All (Permissions section) and Use as Default (if Permissions section is checked).
- **Configure Pin — "Update All [type] Pins" in action bar** (`window-pin-config.hbs`): Update All toggle moved from the header into the action bar left zone and renamed to "Update All [type] Pins" for clarity.
- **Configure Pin — Update All tag filter** (`window-pin-configuration.js`, `window-pin-config.hbs`, `styles/window-pin-config.css`): When "Update All [type] Pins" is active and the scene has same-type pins, a "Filter by tag:" chip row appears below the toggle. Chips show every tag used across all same-type pins on the scene. The current pin's own tags are pre-selected. Selecting multiple chips uses OR logic — any peer pin sharing at least one selected tag is included. Type is always the first gate; tags narrow within it. The confirmation dialog names the active tag filter.
- **Configure Pin — "Default for [type]" with per-section checkboxes** (`window-pin-configuration.js`, `window-pin-config.hbs`): The header "Default" toggle is renamed "Default for [type]". When enabled, each section header shows an additional "Default" checkbox so users choose exactly which sections (Permissions, Classification, Design, Text, Animations, Source) are written to `clientPinDefaultDesigns`. Warns if no sections are checked. Falls back to saving all design fields when no checkboxes are rendered (backward compat).
- **Window position persistence** (`scripts/window-base.js`): All `BlacksmithWindowBaseV2` windows now save and restore their position and size via `localStorage`. Key is `blacksmith-win-pos-<ClassName>`. Position is debounced on `setPosition()` (250 ms) and restored via `requestAnimationFrame` on first render. No code changes needed in subclasses.

### Fixed

- **Journal toolbar — tag row too wide** (`ui-journal-pins.js`): `_populateTagChips` was calling `getPinTaxonomyChoices` which merges registered tags with every global tag ever used across all pins (narrative, backstory, encounter, etc. from other modules). Changed to `getPinTaxonomy` so only the `journal-pin` taxonomy tags are shown.
- **Journal toolbar — selected tags not saved to existing pin** (`ui-journal-pins.js`): The `_ensurePin` update path (existing linked pin) only patched `text` and `image`, silently ignoring the user's tag selections. Fixed to include `tags` in the patch whenever `opts.selectedTags` is provided.
- **Journal toolbar — icon row and tag row not visually connected** (`styles/journal-pins.css`): The outer bar was `display: flex` (row direction), placing the two rows side-by-side instead of stacked. Changed to `flex-direction: column`. The tag row now shares the same `--dnd5e-journal-header-background` as the icon row with complementary border-radius (`3px 3px 0 0` / `0 0 3px 3px`) so they render as one unified toolbar block.
- **Configure Pin — PinManager undefined on save** (`window-pin-configuration.js`): The save handler referenced `PinManager` which was only in scope via dynamic `import()` inside `getData()`. Fixed by adding a local `const { PinManager: PM } = await import('./manager-pins.js')` inside the save handler.
- **Configure Pin — icon tooltip showing "Solid"** (`window-pin-configuration.js`): `formatIconLabel` used `.find(cls => cls.startsWith('fa-'))` which matched `fa-solid` before the icon name. Fixed by skipping known style-prefix classes (`fa-solid`, `fa-regular`, `fa-light`, `fa-thin`, `fa-duotone`, `fa-brands`). Also removed the `.replace(/-/g, ' ')` so the raw icon name (e.g. `skull`) is shown rather than replacing hyphens.
- **Configure Pin — "Default for [type]" toggle not showing as enabled** (`window-pin-config.hbs`): The default toggle input was missing `{{#if defaultMode}}checked{{/if}}`, so toggling it on and re-rendering always rendered it unchecked. Fixed.
- **Configure Pin — "Default for [type]" toggle not hiding section checkboxes** (`window-pin-configuration.js`): The section-default checkboxes are conditionally rendered via `{{#if defaultMode}}`; after `render(true)` the new DOM correctly reflects the flag because the toggle `checked` state is now also restored.
- **Configure Pin — Pin Source header layout** (`window-pin-config.hbs`): The `<span>` wrapping section checkboxes and the source icon had no flex layout, causing the Image/Icon toggle and checkboxes to visually collapse/overlap. Fixed by restructuring: checkboxes moved to a right-aligned `.blacksmith-pin-config-section-actions` span; Image/Icon toggle moved from the section header into the section body as a standalone row.

### Changed

- **Journal toolbar — PIN PAGE button style** (`styles/journal-pins.css`): Button is now green (dark forest green background, light green text) to signal it as the primary action, rather than the neutral dark style used by passive controls.
- **Configure Pin — "Allow Duplicates" moved to Permissions** (`window-pin-config.hbs`): "Allow Duplicates of this Pin on the Canvas" toggle moved from the header into the Permissions section body, alongside ownership and Player Visibility.
- **Context menu — "Visibility" renamed to "Player Visibility"** (`pins-renderer.js`): The right-click context menu item is renamed to match the field name used in Configure Pin and Browse view.
- **Context menu — bulk deletes removed** (`pins-renderer.js`): "Delete All Pins" and "Delete All [Type] Pins" removed from the right-click context menu. Bulk delete is now in the Pin Layers window action bar (GM-only, with confirmation).
- **Configure Pin — section header layout** (`window-pin-config.hbs`, `styles/window-pin-config.css`): All section headers now use a `title | actions` flex layout: icon + title on the left, Update All / Default checkboxes right-aligned with labels. Image/Icon toggle in Pin Source moved to the section body.
- **Pin Layers — Browse Player Visibility icon** (`window-pin-layers.js`): Per-pin Player Visibility action button changed from `fa-eye` / `fa-eye-slash` to `fa-users` / `fa-users-slash` to avoid confusion with the layer-level visibility eye icons.


## [13.6.2]

### Added

- **World tag registry** (`manager-pins.js`, `api-pins.js`, `settings.js`): New GM-writable world setting `pinTagRegistry` (`string[]`) that tracks every tag ever used across all pins. Auto-seeded on `ready` from the built-in taxonomy and auto-populated whenever a pin is created or updated. Exposed on the public API: `getTagRegistry()`, `deleteTagGlobally()`, `renameTagGlobally()`, `seedTagRegistryIfEmpty()`. `deleteTagGlobally` and `renameTagGlobally` scrub all scene pins and saved visibility profile snapshots so profiles never contain stale tags.
- **Pin Layers — tag manage mode** (`window-pin-layers.js`, `window-pin-layers.css`): GMs can toggle a "Manage" icon-button in the Tags section header to enter manage mode, which replaces per-tag toggle counts with X (delete) buttons. Confirming a delete calls `deleteTagGlobally`. Replaced the previously broken right-click context menu (which crashed on empty selector) with this toggle pattern.
- **Pin Layers — Update button** (`window-pin-layers.js`): The profile Update button now only appears when the current visibility state differs from the saved profile snapshot, preventing accidental no-op saves. Profile snapshots are automatically kept current when tags are deleted or renamed globally.
- **Pin Config — Update All mode** (`window-pin-configuration.js`, `window-pin-config.hbs`): Replaced the single "Save and Update All" footer button with an "Update All" header toggle (GM only). When active, each section header (Permissions, Classification, Pin Design, Text Format, Event Animations, Pin Source) shows a checkbox defaulting to unchecked. On save, only checked sections are bulk-applied to all other same-type pins on the scene after a confirmation dialog.
- **`pin-taxonomy.json` v3** (`resources/pin-taxonomy.json`): Restructured as a multi-module master list with top-level `globalTags` array and a `modules` object keyed by `moduleId`. Each pin category has a single `tags` array (removed legacy `defaultTags`/`suggestedTags`). Added `coffee-pub-artificer` entries: `habitat-pin` (12 terrain tags), `component-pin` (6 component types), `harvesting-pin` (14 skill tags).

### Fixed

- **Non-square pin rendering** (`pins-renderer.js`): `_calculatePinPosition` was using `Math.min(w, h)` for both dimensions, forcing all pins square regardless of configured height. Fixed to apply `pinWScreen` and `pinHScreen` independently so a 120×240 pin renders as 120×240.
- **Constrain proportions behaviour** (`window-pin-configuration.js`, `window-pin-config.hbs`): "Constrain proportions" now enforces a true 1:1 square (height = width) and disables the height input while locked, rather than maintaining an arbitrary saved ratio. Toggling off re-enables the height field.
- **`lockProportions` resets to ON on every open** (`window-pin-configuration.js`): `getData()` now reads `lockProportions` from `clientPinDefaultDesigns` for the matching `moduleId|type` key (saved when "Use as Default" is checked), falling back to `w === h` for pins without a saved default, instead of always hardcoding `true`.
- **"Save as Default" missing image fields** (`window-pin-configuration.js`): The design snapshot saved to `clientPinDefaultDesigns` now includes `image`, `imageFit`, and `imageZoom` so the full visual appearance is restored when the window reopens for a matching pin type.
- **Browse tab tag color scheme** (`window-pin-layers.js`, `window-pin-layers.css`): Orange now correctly means visible/active; muted dark means hidden — consistent with the Layers tab. Category chips are styled distinctly (blue-slate with a layer-group icon) to differentiate them from regular tag chips. Removed the redundant "hidden" word badge.
- **Pin Config header** (`window-pin-config.hbs`, `window-pin-configuration.js`): Header now shows `Category: Pin Title` (e.g., `Journal Pin: The Rusty Anchor`) with `pin.text` passed as `pinName`. Previously the pin title was dropped.

### Changed

- **Pin Config — GM-only controls** (`window-pin-config.hbs`): Allow Duplicates, Use as Default, and Update All toggles are now all wrapped in `{{#if isGM}}` so non-GM players never see them.
- **Taxonomy loader** (`manager-pins.js`): `_loadTaxonomyJsonIntoRegistry` reads the v3 format (`globalTags` + `modules.{moduleId}.pinCategories`), with legacy flat `pinCategories`/`pinTypes` fallback for older JSONs.
- **API docs** (`documentation/api/api-pins.md`): Added Tag Registry section documenting `getTagRegistry`, `deleteTagGlobally`, `renameTagGlobally`, and `seedTagRegistryIfEmpty` with usage examples.


## [13.6.1]

### Fixed

- **External `module.api` null during `ready`** (`scripts/blacksmith.js`, `api/blacksmith-api.js`): Assign the full public **`game.modules.get('coffee-pub-blacksmith').api`** **synchronously at the start of `init`**, before any **`await`** in that hook, so other modules’ **`ready`** handlers never see **`api === null`** while Blacksmith’s async **`init`** is suspended. Load **`BlacksmithAPI`** via **`import()`** only when calling **`markReadyForConsumers()`** in **`ready`**. **`markReadyForConsumers()`** calls **`_syncGlobalsFromApi()`** when **`BlacksmithAPI`** is already marked ready so **`window.Blacksmith*`** stays aligned after asset merge; **`_markReady()`** reuses **`_syncGlobalsFromApi()`**.
- **`module.api.assetLookup` stale reference** (`scripts/blacksmith.js`): After each **`initializeAssetLookupInstance`** in **`ready`**, set **`mod.api.assetLookup`** to the live export so consumers do not keep a pre-instance **`null`**.
- **Combat tracker settings before registration** (`scripts/ui-combat-tracker.js`): Read combat-related settings with **`getSettingSafely`** so deferred **`ready`** / timeout paths do not call **`game.settings.get`** before **`registerSettings()`** has run (fixes **`combatTrackerSetFirstTurn` is not a registered game setting** and similar throws).

### Changed

- **Documentation** (`documentation/architecture-blacksmith.md`, `documentation/api-core.md`, `documentation/api-window.md`, `documentation/guides/blacksmith-apis.md`): Document **`module.api`** vs **`window.Blacksmith*`** timing (**`markReadyForConsumers`**), when to use **`BlacksmithAPI.waitForReady()`**, and integration checklist corrections.

## [13.6.0]

### Added

- **Asset Mapping** (`settings.js`, `lang/en.json`): Per-category paths under **Manage Content** default to **`modules/<id>/resources/asset-defaults/*.json`** (shipped with the module). Clear a field to use only the embedded `assets-legacy.js` data for that category (no fetch). Chat card appearance themes remain in **`api-chat-cards.js`** (`CHAT_CARD_THEMES`); legacy `dataTheme` removed.
- **Asset loader** (`asset-loader.js`): `loadAssetBundlesWithOverrides` fetches and merges overrides; `reloadAssetManifestsFromWorldSettings` rebuilds `AssetLookup` and choice caches when a path changes (`onChange` on each Asset Mapping setting).
- **Phase 1 — default JSON split** (`resources/asset-defaults/`, `module.json`): Shipped **`assets-*.json`** (`manifestVersion` + category keys); **`module.json` → `files`** lists them for packaging. Defaults load at runtime via **`fetch`** only (`loadDefaultAssetBundlesFromJson`); **no** Node or build step. **`resources/asset-defaults/README.md`** documents authoring.

### Fixed

- **Asset lookup + module API during `ready`** (`blacksmith.js`): Initialize **`AssetLookup` from bundled assets synchronously** before the first `await` (JSON override fetch). Async `ready` callbacks from other Coffee Pub modules can run between awaits; they must not see **`assetLookup === null`** (`getAllConstants`, `registerModule`, etc.). Optional merge still runs afterward; **`getAllConstants`** uses optional chaining as a safety net.
- **Compendium / roll table / sound choice caches + `BlacksmithAPI` timing** (`settings.js`, `blacksmith.js`, `api/blacksmith-api.js`): **`primeCoreChoiceCaches()`** runs at the **start** of `ready` (before asset fetch) for compendiums/tables/macros. **`BlacksmithAPI.markReadyForConsumers()`** runs **only after** merged asset JSON + **`refreshAssetDerivedChoices()`** so **`BLACKSMITH.arrSoundChoices`** and related caches match shipped + Asset Mapping. **`getCompendiumChoices`** is synchronous (removed unnecessary `async`). **`checkBlacksmithReady()`** no longer calls **`_markReady()`** on `ready` (that ran too early).
- **Menubar vs `registerSettings` order** (`api-menubar.js`, `blacksmith.js`): **`MenuBar.runReadySetup()`** (partials, **`registerSecondaryBarTypes`**, first render) runs **after** **`registerSettings()`**, fixing **`encounterToolbarDeploymentPattern` is not a registered game setting** when **`_registerPartyTools`** read settings before registration.

### Changed

- **JSON layout** (`resources/`, `module.json`, `asset-loader.js`, Asset Mapping in `settings.js` / `lang/en.json`): Renamed/moved files — **`assets-background-cards.json`**, **`assets-skillchecks.json`**, **`config-volumes.json`**, **`config-nameplates.json`**, **`narratives-stats-mvp.json`**; removed Asset Mapping overrides for volumes and nameplates (shipped **`resources/`** config only).

### Documentation

- **`documentation/plan-assets.md`**: Status and implementation notes for split manifests, loader, deferred init, and settings.

## [13.5.10]

### Added

- **Layout & experience → Pins** (`settings.js`, `lang/en.json`): New **Pins** heading under **Canvas** with **Player Pin Editing** (`pinsAllowPlayerWrites`); strings moved out of the **Imports** block so localization matches the sheet order.

### Changed

- **Developer Tools → System** (`settings.js`, `lang/en.json`): **H1 Developer Tools** uses **client** scope so GMs and players see the same tab title. **H2** label is **System** (replaces **Performance**) with an updated hint (menubar tools, performance monitor, latency). Subsections: **H3 Menubar** (show Settings / Refresh tools), **H3 Performance Monitor** (**Enable Performance monitor**, **Heap display refresh interval**), **H3 System Latency** (unchanged settings, clarified hints).
- **Pins UI** (`manager-pins.js`, `api-menubar.js`): Pin visibility and clear actions are **only** in the **left hamburger menu** (**Pins** submenu via `CoreUIUtility.getLeftStartMenuItems` / `MenuBar._getPinsVisibilityMenuItems`); there is no pin control on the main menubar strip. Removed `pins-visibility`-specific icon fallbacks in menubar zone grouping.

### Removed

- **Menubar pins tool** (`manager-pins.js`): Unregistered **`pins-visibility`** (previously hardcoded `visible: false` / briefly tied to a toggle).
- **Setting** `menubarShowPins` (**Show Pins Toggle Tool**) (`settings.js`, `lang/en.json`): Dropped; stale client values are harmless.

### Fixed

- **Latency + SocketLib** (`manager-sockets.js`): **`ping`**, **`pong`**, and **`latencyUpdate`** handlers are **always** registered once the Blacksmith socket is ready. Payload handling still no-ops when **Enable System Latency Checks** is off. Prevents **`SocketlibUnregisteredHandlerError: No socket handler with the name 'ping'`** when the GM disables latency but another client (e.g. not yet refreshed) still sends pings.

### Documentation

- **`documentation/plan-settings.md`**: Tracking table and findings updated for **System** settings layout, **Pins** (hamburger-only, **Canvas → Pins**), and latency handler registration model.

## [13.5.9]

### Added

- **Vision (GM Quickview)** (`settings.js`, `lang/en.json`): New **Run the Game → Vision** block — **Enable Quickview** (`quickViewEnabled`, client, mirrors menubar/hotkey), **Darkness overlay strength** (moved from User Experience → Canvas), **Out-of-sight token highlight color** (`quickViewSightHighlightColor`, hex string).
- **Quickview keybinding**: **Toggle Quickview** via Foundry **Configure Controls** — default **Ctrl+Q** (`game.keybindings.register` on **`init`**, with **`ready`** + **`initialize()`** fallbacks so the action always appears under **Coffee Pub Blacksmith**). **`utility-quickview.js`**
- **Menubar Quickview** (`utility-quickview.js`): Tool **visible for GMs**; right-click **Enable Quickview** / **Disable Quickview**; start menu (`utility-core.js`) uses the same labels.

### Fixed

- **Quickview — out-of-sight token highlight** (`utility-quickview.js`, `manager-libwrapper.js`): Highlights no longer relied on `token.visible` after a deferred pass (often always true for GMs). **Detection** uses **`canvas.visibility.testVisibility`** (with **`token.isVisible`** fallback) **before** forcing GM visibility. **Drawing** uses **`canvas.interface`** (world-space rounded rect) so borders are not dimmed with token meshes. **`restrictVisibility`** wrapper runs **`_syncQuickViewHatchAfterRestrict`** immediately; deferred **`_scheduleQuickViewTokens`** only reapplies GM visibility and redraws stored highlight IDs (`_reapplyGmTokenVisibilityAndOverlays`).
- **Combat timer** (`timer-combat.js`): Align **`state.duration`** with configured turn length on init and use **`Math.max(configuredLimit, state.duration)`** for progress **width** so the bar matches “time remaining” when duration and settings differ (fixes bar stuck at full width).
- **Planning timer** (`timer-planning.js`, `styles/timer-planning.css`, `ui-combat-tracker.js`): **Do not** treat an **empty** `combat.turns` as “all initiatives rolled”; start only via **`updateCombatant`** / deferred **`_tryStartWhenPlanningReady`** so the bar does not flash on round advance before initiative clears; **`renderCombatTracker`** strips planning DOM when **verify** fails; GM **`updateCombat`** stops the timer when initiative is cleared mid-planning; **one** shared **`_planningBarDenominatorSeconds()`** for bar width, color tiers, and “ending soon” interval logic (fixes critical-threshold mismatch); **brightness** pulse instead of **opacity** for **`.low`** to avoid edge strip artifacts; **ready** pass on **`CombatTracker`** runs **`_checkAllInitiativesRolled`** when combat is already active (reload).

### Changed

- **Quickview (GM)** (`utility-quickview.js`): On/off is driven by the **Enable Quickview** client setting (menubar, hotkey, and settings sheet stay in sync); changing scenes clears the setting when Quickview was active; **`canvasReady`** reapplies when the setting is on after load.
- **Performance**: **Round / planning / combat tracker timers** — avoid per-tick or per-`updateUI` `document.querySelectorAll` hot paths by caching bar/text/progress (or round/total time) element lists; **refresh** when cached nodes disconnect, when the combat tracker re-renders (`renderCombatTracker`), or when the cache is empty while the timer should be visible (`timer-round.js`, `timer-planning.js`, `timer-combat.js`). See **`documentation/PERFORMANCE.md`** rank 5.
- **Documentation**: Merged `documentation/PERFORMANCE-journal-lifecycle-checklist.md` into **`documentation/PERFORMANCE.md`** (single source of truth). Added code-review items: duplicate journal pin hooks, `JournalDomWatchdog` sheet retention, Quick View hooks, pin renderer cleanup gap.
- **Performance**: **`JournalPagePins`** — register `renderJournalSheet`, `renderJournalPageSheet`, and journal-filtered `renderApplication` via **`HookManager` only** (removed duplicate `Hooks.on` that ran pin logic twice per render). **`JournalDomWatchdog`** — prune detached journal sheet roots from `_knownSheets` each interval tick to avoid retaining closed sheet DOM for the whole session.
- **Performance**: **Menubar** (`api-menubar.js`) — **`renderMenubar`** skips full DOM remove/rebuild when a **structure fingerprint** (tools, notifications, secondary bar, movement, leader text, etc.; not per-second timer) is unchanged; applies **lightweight refresh** for timer/progress/leader/movement labels. **`updateLeaderDisplay`** triggers a full render only when this user’s **party-leader role** changes (leader-only tools visibility).
- **Fix**: Menubar fingerprint now includes **live secondary bar content** (`secondaryBarInfoUpdates` + custom bar `data` JSON) so **`updateSecondaryBarItemInfo`** / **`updateSecondaryBar`** still force a real rebuild when reputation, party health, Minstrel, Herald, etc. update while a bar is open.
- **Fix**: Fingerprint also includes **`secondaryBarActiveStates`** (switch / “select one” groups) and **toggleable** secondary button `active` flags so the selected button styling updates after **`updateSecondaryBarItemActive`** / toggle clicks.

## [13.5.8] - 2026-03-02 - PERF STACK QUICK WINS (RANK 7)

### Added

- **Performance**: Ranked checklist for encounter toolbar, journal page pins, and duplicate journal monitoring — **now in** `documentation/PERFORMANCE.md` (Journal & encounter lifecycle checklist); was shipped as `PERFORMANCE-journal-lifecycle-checklist.md` in this release.
- **Public API**: `game.modules.get('coffee-pub-blacksmith').api.createJournalEntry(journalData)` — same behavior as JSON journal import (narrative / encounter / location). **Docs:** `documentation/api-create-journal-entry.md`.
- **Public API**: `api.BlacksmithWindowBaseV2` and `api.getWindowBaseV2()` — stable access to the Application V2 base class for subclassing (registry `registerWindow` / `openWindow` unchanged). **Docs:** `documentation/api-window.md`. **Timing:** base class is also seeded on `module.api` at **module load** (before `init`/`ready`) so dependents that pick a superclass at import time (e.g. Regent) see it when listed after Blacksmith; registry methods still attach in `ready`.

### Changed

- **Internal (file naming, Batch 4)**: `window-base-v2.js` → **`window-base.js`** (canonical Application V2 base); `blacksmith.js` imports `window-base.js`. **`window-base-v2.js`** is a thin re-export shim for stale deep links. Class name **`BlacksmithWindowBaseV2`** and **`module.api`** surface unchanged.
- **Internal (file naming, Batch 4 partial)**: `data-collection-processor.js` → `manager-data-collection.js` (`constants-generator.js` import updated; exported class still `DataCollectionProcessor`).
- **Internal (file naming, pre–Batch 4)**: `latency-checker.js` → `manager-latency-checker.js`; `window-pin-config.js` → `window-pin-configuration.js`. Imports (`blacksmith.js`, `manager-sockets.js`, `api-pins.js`) and architecture docs updated; templates/CSS remain `window-pin-config.*`.
- **Internal (file naming, Batch 3)**: Renamed scripts to role-first names — `encounter-toolbar.js` → `ui-journal-encounter.js`, `combat-tracker.js` → `ui-combat-tracker.js`, `combat-tools.js` → `ui-combat-tools.js`, `journal-tools.js` → `manager-journal-tools.js`, `journal-page-pins.js` → `ui-journal-pins.js` (also `module.json` esmodules entry), `vote-config.js` → `window-vote-config.js`. Imports updated; behavior unchanged.
- **Compatibility shims**: Restored tiny `scripts/journal-page-pins.js` and `scripts/common.js` that re-export from `ui-journal-pins.js` / `utility-common.js` so stale manifests, caches, or deep links do not 404.
- **Targeted token rings**: **Use Player Color** — concentric borders still use each user’s color; **inner fill** only for users with **OWNER** on the **active combatant** during started combat (others get border-only rings). New **Border Thickness** (`targetedIndicatorBorderThickness`, 1–10, default 3) drives targeted ring line width (separate from General Indicators thickness). **Default Border / Default Background** colors renamed (hex **String** settings; `ColorField` as `register` `type` was reverted — it could **stall world load** at “Finalizing…”). `_coerceColorSettingToHex` still normalizes reads. Setting order: Style → Animation → Speed → **Border Thickness** → **Use Player Color** → default colors. **Fix:** `User#color` via `Color.from()` + numeric coercion (v13). **Load fix:** early `registerSettings()` wrapped in try/catch + `forceHide` on failure.

- **Votes**: Eligible voters are **logged-in non-GM users with OWNER on at least one token in the current scene**; quorum/progress/`castVote` use a per-vote `eligibleUserIds` snapshot. Starting a vote with nobody eligible shows a clear warning. Character-vote “players” source uses the same rule.
- **Party leader menu**: Labels show **player names only** in parentheses (active player owner preferred, never the GM display name); character-only label when only the GM has owner access. Dialog select matches the same labels.
- **SocketManager (native fallback)**: Before registering the inbound `game.socket` listener, tear down any existing listeners on the module channel via `game.socket.off(...)` and reset the native handler map so re-init / hot reload does not stack duplicate handlers.
- **HookManager**: Removed no-op `renderApplication` and `closeApplication` registrations (empty callbacks left after window-registry work); reduces redundant hook dispatch noise.
- **BlacksmithWindowBaseV2**: Dropped scroll save/restore for unused `.blacksmith-window-template-details-content`; body scroll handling unchanged.
- **Menubar (right zone)**: Session timer is always the rightmost control; dynamic right-zone tools render before it.
- **Journal double-click watchers (Phase B)**: In `scripts/blacksmith.js`, removed duplicate direct fallback hooks (`renderJournalSheet` / `renderJournalPageSheet`) and removed the extra capture-phase page-navigation click listener. HookManager + MutationObserver path remains; this trims duplicate callback pressure while keeping behavior.
- **Journal monitoring consolidation (Phase C)**: Added shared `scripts/journal-dom-watchdog.js` and rewired `blacksmith.js`, `encounter-toolbar.js`, and `journal-page-pins.js` to consume a single journal sheet/page event pipeline. This removes per-feature DOM observer/interval fallbacks and completes the duplicate journal monitoring consolidation (rank 3).

### Removed

- **Menubar user exclusion (moved to Herald)**: Removed world setting **Excluded Menubar Users** (`excludedUsersMenubar`) and the **Blacksmith Menubar** settings heading. Blacksmith no longer reads a comma-separated user list; menubar/combat-bar exclusion stubs always allow. Vote flows no longer use that list for eligibility (use Herald for per-user UI policy).

### Fixed

- **Start menu (hamburger)**: The performance row shows the same **heap readout** as the optional menubar performance tool (`Heap: …` / `Heap: N/A`); click still opens the full **PERFORMANCE CHECK** notification. Typo: Quick View description “larity” → “clarity”.
- **Apply on Load** (`canvasToolsHideUIOnLoad`): Hiding the core UI on load now uses **computed** `display` for visibility checks, **silent** toggle (no toast spam), **delayed retries** (`requestAnimationFrame`, timers), and **`canvasReady`** so v13 can build `#ui-left` before we hide.
- **Targeted ring (custom indicator)**: Removed the guard that only handled **`game.user`** targets; target state is tracked **per user** and **unioned** so all clients see rings for **everyone’s** targets. Seeded from **`User#targets`** on refresh; `updateUser` clears disconnected users.

- **Combat bar (menubar)**: After closing the secondary combat bar, the toolbar button could not reopen it because `__combatBarUserClosed` was enforced inside the patched `openSecondaryBar` while the menubar **API** sometimes invoked the **unpatched** `toggleSecondaryBar` (no flag reset). Manual opens no longer use that guard; **`openCombatBar()`** (hook-driven auto-open) still respects **user dismissed**. Active combat resolution uses **`game.combats.active`** with **`game.combat`** fallback.

- **Performance (journal / encounter lifecycle)**: **`EncounterToolbar.dispose()`** and **`JournalPagePins.dispose()`** tear down their prior per-feature DOM observers/intervals and HookManager registrations; **`Hooks.once('closeGame', …)`** in **`blacksmith.js`** invokes both. **`init()`** is idempotent on both managers. Removed debug **`console.log`** on **`renderJournalSheet`** in the journal double-click ready block. **`documentation/PERFORMANCE.md`**, **`performance.md`**, and **`TODO.md`** stack rows updated; duplicate journal monitoring consolidated (rank 3).

- **World settings**: Removed duplicate `movementType` registration that overwrote the intended default; single hidden setting now defaults to `normal-movement`, consistent with code fallbacks.
- **Menubar performance monitor**: Tool visibility now follows **Show Performance Monitor Tool** (`menubarShowPerformance`); label shows **client JS heap** (`Heap: X.X MB` or `Heap: N/A`) and updates on the same cadence as the session timer tick, with tooltip + click still opening the full performance notification. Re-renders when performance visibility or poll interval settings change.

### Documentation

- **Performance stack (rank 7)**: Updated `documentation/PERFORMANCE.md` and `documentation/performance.md` — pass 1 complete for no-op hooks, duplicate setting, and dead scroll branch; optional Regent/CSS follow-up noted. `documentation/TODO.md` stack table aligned.
- **Performance stack (rank 6)**: Documented native socket inbound teardown in `PERFORMANCE.md` / `performance.md` and `TODO.md` (stack row 6).


## [13.5.7] - 2026-03-14 - SETTINGS ORGANIZATION & CLEANUP

### Changed

- **Campaign settings hierarchy**: Reorganized the `Getting Started` campaign block so `Campaign Settings` is now the primary section with `Core`, `Geography`, and `Party` nested beneath it. `Campaign Name` now appears first in `Core`, followed by `Default Rulebooks`.
- **Party configuration model**: Replaced freeform party defaults as the primary source of truth with a declarative party setup. `Party Size` now drives party-member actor dropdowns, and prompt generation now derives party makeup and average level from the selected actors with legacy fallback support.
- **Rulebook configuration model**: Replaced rulebooks-as-text-only with a mixed model. `Number of Rulebooks` now drives rulebook compendium dropdowns, while the old text setting is now `Custom Rulebooks` for supplemental freeform sources.
- **Imports settings hierarchy**: Split import-related configuration out into a dedicated `Imports` section with `Item` and `Journal` subsections. Journal defaults are now grouped under `Narrative` and `Encounter`, while `Enhanced Image Guessing` now lives under `Imports > Item`.
- **Regent AI settings layout**: Restored missing top-level Regent settings headings by adding `AI Settings` and `OpenAI`, plus visible narrative headings in Regent so its settings page has the same structural treatment as Blacksmith where appropriate.
- **Encounter toolbar (journal)**: Items can wrap on narrow journal sheets; Deploy All is in the header next to the visibility badge and styled as a badge (span with `badge-deploy.deploy-monsters`). Removed unused `.encounter-btn` CSS.
- **Journal pins toolbar**: Pin Page is now the first button; the Image (use first image from page) icon option is second, immediately after Pin Page. Removed `margin-left: auto` from the Pin Page button so it stays at the start.

### Fixed

- **Regent duplicate cookie setting**: Removed the bad duplicate `Narrative Use Cookies` checkbox in Regent that was actually a misregistered `openAIContextLength` setting.
- **Regent/Blacksmith narrative default ownership**: Removed duplicate Regent registrations for Blacksmith-owned narrative import defaults (`defaultNarrativeFolder`, `narrativeDefaultCardImage`, `narrativeDefaultImagePath`) and updated Regent to read those values from Blacksmith instead.
- **Prompt default sourcing**: Narrative, encounter, item, table, and actor prompt helpers now use normalized campaign data instead of reading a mix of old raw settings directly.
- **Encounter actor folder sourcing**: Encounter-toolbar world-actor creation now uses the normalized campaign journal defaults instead of reading `encounterFolder` directly from raw settings.
- **Narrative scene parent replacement**: Blacksmith now fills the narrative prompt's existing `[ADD-SCENE-PARENT-HERE]` token from campaign geography instead of leaving it unresolved.
- **Encounter Reveal – tokens visible on canvas**: The encounter bar Reveal button now updates token documents via `scene.updateEmbeddedDocuments('Token', updates)` and refreshes token placeables so hidden NPC tokens become visible on the canvas for all clients.
- **Encounter Reveal – no hidden tokens found**: Reveal no longer required hostile disposition or strict NPC type; it now includes any hidden token that is not player-owned, so hidden NPCs with neutral or unset disposition are found and revealed. Tooltip updated to "Reveal hidden NPC tokens on the canvas".

### Added

- **Campaign subsystem**: Added `scripts/manager-campaign.js` to normalize campaign, geography, party, rulebook, and journal-default data from Blacksmith settings.
- **Campaign API**: Added `scripts/api-campaign.js` and exposed `module.api.campaign` as the public read-only contract for normalized campaign data.
- **Campaign API documentation**: Added [documentation/api-campaign.md](/c:/Users/drowb/AppData/Local/FoundryVTT/Data/modules/coffee-pub-blacksmith/documentation/api-campaign.md) so other Coffee Pub modules can migrate away from raw settings reads.
- **Richer prompt context**: Added `partyName` and `partyClasses` to the normalized campaign prompt context so Blacksmith prompts can consume more than just party size, level, and makeup.

## [13.5.6] - 2026-03-14 - CHAT CARD CLEANUP, TOKEN SETTINGS & NAMEPLATE REMOVAL

### Added

- **Hurry Up combat chat card**: The combat menubar `Hurry Up` action now posts a proper Blacksmith chat card instead of plain text, so it uses the normal Coffee Pub card styling/theme pipeline.
- **Token override enable gates**: Added `Enable Token Scale` and `Enable Image Fit Mode` so dropped-token scale and fit-mode overrides only apply when explicitly enabled.

### Changed

- **Chat card padding persistence**: `Remove Chat Card Padding` is now stored per Coffee Pub chat message at creation time so newer cards keep the wrapper behavior they were created with across refreshes.
- **Chat card padding fallback**: Startup/render fallback for `Remove Chat Card Padding` now defaults to keeping Foundry padding, matching the opt-in intent of the setting.
- **Token and chat settings organization**: The default Coffee Pub theme selector now lives under `Chat Cards`, and the `Chat Gap` slider range was tightened to `0..20`.
- **Live card theme catalog**: Renamed the neutral card theme display name from `Default` to `Tan` and added a new `Amber` theme with warm gold/brown narration-friendly accents.
- **Dropped token overrides**: Token scale and image fit mode settings now only apply when their new enable checkboxes are turned on.

### Removed

- **Optional menubar toggle**: Removed `Enable Menubar` from settings and the related runtime gating. The menubar is now treated as required.
- **Token nameplate styling feature**: Removed the non-functional `Token Nameplate Style` settings and all related runtime code after confirming the feature was not reliable in Foundry v13+.
- **Stale nameplate TODO**: Removed the obsolete documentation TODO entry for adding a nameplate-style enable setting.




## [13.5.5] - 2026-03-13 - TOKEN OWNERSHIP CLEANUP, COMBAT BAR FILTERING & CURATOR CLEANUP

### Added

- **Combat bar dead-token visibility option**: Added `Hide the Dead` for the combat menubar so defeated combatants remain in the combat tracker but are hidden from the combat portrait bar when enabled.
- **Blacksmith token indicator manager**: Added `scripts/manager-token-indicators.js` to own current-turn and targeted token indicators inside Blacksmith. The manager handles indicator rendering, animation, target clearing on turn change, native target-marker hiding, token movement updates, visibility refreshes, and live refresh when indicator settings change.
- **Blacksmith token rotation hook**: Restored token facing rotation as a Blacksmith-owned feature in `scripts/manager-canvas.js`, driven by the existing Blacksmith settings `enableTokenRotation`, `tokenRotationMode`, and `tokenRotationMinDistance`.
- **Coffee Pub chat card padding toggle**: Added `Remove Chat Card Padding`, a Coffee Pub-only chat setting that removes Foundry's wrapper inset around Coffee Pub chat cards without affecting standard Foundry messages.
- **Amber chat card theme**: Added a new `Amber` theme to the live chat-card theme catalog with warm gold and brown narration-friendly accents that still match the existing Blacksmith card family.
- **Project TODO tracking**: Added `todo.md` with a follow-up item to decide how Curator should handle asset defaults that currently point to Blacksmith paths.

### Changed

- **Indicator ownership restored to Blacksmith**: Current-turn and targeted indicator initialization now runs from Blacksmith instead of Curator, so the feature works without depending on Curator.
- **Combat bar refresh behavior**: Combat menubar now refreshes immediately when the new dead-token visibility setting is toggled.
- **Coffee Pub chat card wrapper handling**: Coffee Pub chat messages are now identified at chat-message creation/render time so wrapper-level styling can be applied only to Coffee Pub cards.
- **Theme settings rebuilt around live chat-card themes**: Removed the legacy theme-toggle model, rebuilt theme choices from the current `CHAT_CARD_THEMES` catalog, and moved the default Coffee Pub theme selector into `Chat Cards`.
- **Chat settings organization**: Renamed `Chat Adjustments` to `Chat Cards` and kept the card-presentation controls together in a single settings section.
- **Neutral theme naming**: Renamed the live neutral card theme display name from `Default` to `Tan` so the setting no longer reads like “default default.”
- **Chat gap bounds**: Tightened the `Chat Gap` slider range from `-20..60` to `0..20`.
- **Nameplate ownership cleanup**: Token nameplate handling now lives only in `manager-canvas.js`, which is the correct owner alongside other Blacksmith token behavior features.

### Removed

- **Obsolete chat card spacing sliders**: Removed the dead `Top/Bottom/Left/Right Padding` chat settings and the legacy `chatboxLoot` CSS path they depended on.
- **Obsolete chat top-offset setting**: Removed `Top Offset` and its unused runtime/CSS path from Chat Adjustments.
- **Curator orphaned indicator code**: Removed the old turn-indicator, targeted-indicator, and related token-visibility/movement helper code from Curator’s `token-image-utilities.js`.
- **Duplicate Blacksmith nameplate path**: Removed the legacy nameplate hook and helper functions from `scripts/blacksmith.js`; `CanvasTools` is now the single active nameplate path.
- **Curator migration fallback to old indicator key**: Removed the stale monster-mapping fallback in Curator that referenced the old `targetedIndicatorEnabled` key.
- **Obsolete window titlebar controls**: Removed the `Windows` titlebar size/spacing settings and their unused runtime/style path, since current Foundry window headers no longer need or honor those adjustments.

### Fixed

- **Coffee Pub chat card inset spacing**: Fixed the visible gap between Coffee Pub cards and the Foundry chat message wrapper by replacing the dead per-side card sliders with a Coffee Pub-only wrapper padding toggle.
- **Chat card padding persistence**: Coffee Pub cards now store their padding-removal choice in message flags at creation time, so new cards retain the wrapper behavior they were created with across refreshes.
- **Padding toggle startup fallback**: Fixed the render-time fallback for `Remove Chat Card Padding` so startup/refresh now defaults to keeping padding unless the opt-in setting is explicitly enabled.
- **Current turn and targeted indicators not showing**: Fixed a regression where indicator rendering stopped after the Curator split by moving ownership and initialization back into Blacksmith.
- **Blacksmith token rotation settings had no live implementation**: Fixed the structural gap where rotation settings remained in Blacksmith after the Curator cleanup but no runtime code still honored them.


## [13.5.4] - 2026-03-12 - PIN VISIBILITY, JOURNAL PINS & LOCATION IMPORT

### Added

- **Pin context menu – GM visibility toggle (independent of ownership)**: Added a GM-only `Visibility` submenu on pin right-click with `Visible` and `Not Visible`. This uses `pin.config.blacksmithVisibility` (not ownership) to control player visibility.
- **Journal page pin toolbar – image option**: Added a new `Image` icon option that uses the first image found on the selected journal page as the pin image (supports image pages and first `<img>` in text pages). File: `templates/toolbar-pins.hbs`, `scripts/journal-page-pins.js`.
- **Location journal import type**: Added a new import type `location` to the Journal Import flow, with full prompt/template support:
  - Template: `templates/journal-location.hbs`
  - Prompt: `prompts/prompt-location.txt`
  - Routing and rendering: `scripts/blacksmith.js`, `scripts/common.js`, `scripts/const.js`
- **Location journal card section**: Added a simple location card block after `Introduction` in `journal-location.hbs` (title = location name, image title field, same image as main location image, primary text above image, facts below image).

### Changed

- **Pin context menu order**: `Visibility` now appears in the core pin menu directly above `Animate`.
- **Journal page pin label source**: Journal-page pins now use the **page title** (`page.name`) for pin text instead of the parent journal name. Existing reused linked pins are also updated to the current page title when re-pinning.
- **Journal page pin toolbar layout**: Toolbar icon controls now wrap on smaller journal windows instead of overflowing.
- **Journal page pin toolbar option order**: The `Image` option is now last in the icon list.
- **Configure Pin – Use as Default**: Saved pin defaults now include `ownership` (who can access the pin) when "Use as Default" is enabled, so access settings persist in defaults.
- **Prompt filename correction**: Location prompt file path updated to `prompt-location.txt` (from `.xt` typo) in importer fetch logic.
- **Location prompt/schema updates**: `prompt-location.txt` now requires JSON output inside a fenced ```json code block, includes `journalname` in the schema, and documents importer defaults for omitted values (`foldername` -> `Libraries`, `journalname` -> `Locations`).
- **Location import mapping updates**: Location import now uses `journalname` for Journal Entry name while `title` remains the page title; if omitted, defaults are applied (`Libraries` folder, `Locations` journal). Location card fields are also mapped in importer logic (`cardimagetitle`, `carddescriptionprimary`, `carddescriptionsecondary`, with fallbacks).

### Fixed

- **GM pin opacity for Not Visible state**: Pins marked `Not Visible` now remain consistently at 50% opacity for GM (instead of briefly dimming then returning to full opacity) across render/update paths.
- **Pin config border thickness focus jump**: In Configure Pin, entering Border thickness no longer shifts focus to the border color text input (border wrapper changed from `<label>` to `<div>` in `templates/window-pin-config.hbs`).
- **Location card facts formatting**: When location card facts are provided as plain text, importer now normalizes them to an HTML list (`<ul><li>...</li></ul>`) for consistent rendering below the card image.
- **Image pin clipping at rounded border radius**: Fixed image pin clipping artifacts by matching image clip radius to the inner border radius (accounting for scaled border thickness), preventing top-edge clipping on rounded pins.


## [13.5.3] - 2026-03-03 - BALANCEBAR, REPUTATION & CHAT CARDS

### Added

- **Balancebar secondary bar item (API)**: New item kind `'balancebar'` for default secondary bars. Range -100 to +100 with origin at center; a **marker** (circle) indicates the value. Required: `width`, `borderColor`, `barColorLeft`, `barColorRight`, `markerColor`. Optional: `percentProgress` (default 0), `title`, `icon`, `leftLabel`, `rightLabel` (inside bar), `leftIcon`, `rightIcon` (outside bar), `height`, `onClick`, `contextMenuItems`. Update via `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, ... })`. Documented in `documentation/api-menubar.md`.
- **Display-only bar callbacks**: Progressbar and balancebar (and info) items support optional `onClick` for left-click and `contextMenuItems` (array or function) for right-click context menu. Secondary bar context menu handler extended so items with `contextMenuItems` show the menu; click handler invokes `onClick` for any item that has it (switch/toggle state only for buttons).
- **Manager-reputation.js**: Party reputation stored in **world setting** `blacksmithPartyData` (per-scene under `scenes[sceneId]` with `reputation`, `uuid`, `title`); reputation is a subset so other party data can be added later. `getPartyReputation(scene)`, `setPartyReputation(value, scene)`, load of `resources/reputation.json` for scale (label, description per band), `getScaleEntry(value)`, `registerPartyBarItem(api)`, `refreshPartyBarReputation(api)`. **Current Reputation** and **New Reputation** chat cards posted via chat card API (templates `cards-reputation-current.hbs`, `cards-reputation-new.hbs`) with scene name and scale data from JSON. Party bar Reputation balancebar registered from manager; right-click menu: Send Current Reputation, Increase by 5/1, Reset to 0, Decrease by 1/5 (each change posts New Reputation card).
- **Reputation API**: On `module.api`: `getPartyReputation`, `setPartyReputation`, `getReputationScaleEntry`, `postCurrentReputationCard`, `postNewReputationCard`. Documented in `documentation/api-menubar.md` (§ Reputation API).

### Changed

- **Progressbar icons**: Left/right icons (`leftIcon`, `rightIcon`) are now rendered **outside** the bar (siblings of the bar div), matching balancebar; CSS added for `.secondary-bar-item-progressbar-icon-outside-left` / `-outside-right`.
- **Balancebar icons**: Corrected placement so `leftIcon` appears on the left and `rightIcon` on the right (outside the bar).
- **Reputation context menu**: Party (non-GM) users only see **Send Current Reputation** in the reputation balancebar right-click menu; GMs see all options (send plus increase/decrease/reset). Tooltip updated to "Right-click for options."
- **Menubar on scene change (canvasReady)**: When the canvas becomes ready (including after the GM loads a scene), the menubar is always re-rendered so tool visibility reflects the current scene (e.g. combat bar button shows when the scene has active combat). If the party bar is open, party bar info (reputation, health) is refreshed. If the combat secondary bar is open but the new scene has no active combat, the combat bar is closed automatically.


## [13.5.2] - 2026-03-03 - PARTY BAR & PROGRESSBAR

### Added

- **Combat bar scroll arrows**: Left/right arrow buttons to scroll the portrait strip when it overflows. Arrows are shown only when the strip overflows (`.combat-portraits-overflowing`); scroll step = one portrait width + gap. Tracker, prev/next turn/round, scroll arrows, and Action (End Combat, etc.) sit inside `.combat-portraits-scroll-wrapper` next to each other. Menubar tool registered as `combat-bar` (secondary bar mapping `combat` → `combat-bar`). Combat bar styles moved to `styles/menubar-combatbar.css`; scroll arrows reuse shared button styling; control buttons use icons only with `data-tooltip` / `aria-label`.
- **Manager-party.js**: New `PartyManager` (`scripts/manager-party.js`) with `getActorHp(actor)` and `getPartyHealthSummary()` (sum of current/max HP across player-owned characters for progressbar). Exposed on `module.api` as `getPartyHealthSummary` and `getPartyActorHp`.
- **Progressbar secondary bar item**: New item kind `'progressbar'` for default secondary bars. Required: `width`, `borderColor`, `barColor`, `progressColor`, `percentProgress`. Optional: `title`, `icon`, `leftLabel`, `rightLabel`, `leftIcon`, `rightIcon`, `height`. Full bar = 100%; left/right labels are overlaid on the bar (do not shift or shrink it). Update via `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, ... })`. Documented in `documentation/api-menubar.md`.
- **Party bar layout and Party Health progressbar**: Party secondary bar **middle zone** = action buttons (Deployment Pattern, Deploy Party, Vote, Statistics, Experience). **Right zone** = Party Health progressbar: heart icon, "Party Health" label to the left of the bar, current/max HP overlaid on the bar (e.g. 616 | 767). Progressbar refreshes on register, when party bar opens, and on `updateActor` when party bar is open; data from `PartyManager.getPartyHealthSummary()`.
- **Clear Party (party bar and encounter bar)**: New `clearPartyFromCanvas()` in `utility-party.js` removes all party (player-owned character) tokens from the current scene; GM-only. **Party bar** has a "Clear Party" button in the middle zone (GM-only). **Encounter bar** has three new middle-zone buttons (GM-only): **Clear Party** (same behavior), **Clear Monsters**, and **Clear NPCs**.
- **Encounter bar – Clear Monsters and Clear NPCs**: `EncounterManager.clearMonstersFromCanvas()` in `manager-encounter.js` removes only non-humanoid NPC tokens from the canvas (humanoid NPCs e.g. merchants remain). `EncounterManager.clearNpcsFromCanvas()` removes only humanoid NPC tokens (e.g. merchants, guards); party and monster tokens are not removed. Both use D&D 5e creature type (`actor.system.details.type.value` or `details.creatureType`). Tokens with missing creature type are left unchanged.
- **Party leader / Vote helpers**: New `isCurrentUserPartyLeader(moduleId)` in `api-core.js`: returns true if the current user is the stored party leader (`partyLeader.userId`) or owns the leader's character (handles legacy data where userId was GM). Used for Vote button visibility, vote-config, vote-manager, and manager-toolbar leader checks.

### Changed

- **Party bar zones**: All party action buttons now explicitly use `zone: 'middle'`. Party health progressbar uses `zone: 'right'`.
- **Party leader dropdown**: `_getLeaderEntries()` in `api-menubar.js` now prefers a non-GM active owner for display, so the dropdown shows the logged-in player's name (e.g. "Favia Gita (Favia)") instead of "(Game Master)" when the player has ownership.
- **Combat bar**: `toggleCombatTracker()` added to MenuBar (uses `CombatTracker.isCombatTrackerOpen()`, `closeCombatTracker()`, `openCombatTracker()`). Combat bar overflow/scroll state and arrow disabled state updated via ResizeObserver, scroll listener, and after open (rAF + short delay).
- **Combat bar architecture (separation of concerns)**: Combat menubar orchestration was moved out of `api-menubar.js` into `scripts/manager-combatbar.js`. Combat bar registration now uses the public menubar API pattern (`registerMenubarTool('combat-bar')`, `registerSecondaryBarType('combat')`, and secondary-bar tool mapping) from the manager, matching other modules.
- **Combat bar scroll implementation location**: Smooth horizontal portrait scrolling helper logic was moved into `manager-combatbar.js` and no longer lives in a standalone `combat-bar-scroll.js`.
- **Combat bar endcap layout**: Right combat endcap width is now fixed to `175px`, and long combatant names in the lower endcap line truncate with ellipsis instead of wrapping.
- **Menubar button audio (global)**: Clicking a primary menubar button or a standard secondary-bar button now plays `SOUNDBUTTON04` at `SOUNDVOLUMESOFT`. Custom secondary bars (for example, combat) are excluded from this default secondary-bar click sound.
- **Vote visibility**: Vote button (party bar and vote icon state) and "can start vote" logic now use `isCurrentUserPartyLeader()`, so the party leader sees Vote and can start votes even when stored `partyLeader.userId` was set incorrectly (e.g. from an older dropdown).
- **World-setting writes by non-GMs**: `setNewLeader()` only calls `setSettingSafely('partyLeader', ...)` when `game.user.isGM`. `receiveLeaderUpdate()` no longer writes the setting on receiving clients (display-only; setting syncs from GM). `setSettingSafely()` in `api-core.js`: skips the set when the setting is world-scoped and the user is not a GM (checks `setting.scope` and `setting.config?.scope`); on any thrown error from `game.settings.set` when the user is not a GM, returns `true` so permission errors do not propagate. Leader dialog "None" path now uses `setSettingSafely` instead of direct `game.settings.set`.

### Fixed

- **Combat bar scroll – left arrow when portraits centered on load**: At-start/at-end no longer assume the first portrait is visible. Logic now uses "no content off-screen": at start when the first (leftmost) portrait's **right** edge is at or right of the viewport's left edge; at end when the last portrait's **left** edge is at or left of the viewport's right edge. Left arrow stays enabled when the strip is centered until the user has scrolled far enough left that the first portrait touches the viewport.
- **Combat bar portrait-scroll controls visibility and disabled state**: Scroll arrows now appear as a pair only when portraits overflow the container. When shown, each arrow is visually disabled only at its own boundary (leftmost/rightmost), and disabled buttons retain a normal arrow cursor instead of a "not-allowed" cursor.
- **Combat bar auto-scroll on turn advance**: Auto-scroll now runs only when the current combatant would otherwise be clipped/off-screen after turn/round changes, keeping the active portrait visible without unnecessary camera-like jumps.
- **Combat bar active-combat auto-show on load**: With "Automatically Show" enabled, the combat bar now also opens correctly when a client loads into an already-active combat (not only when combat is created during the session).
- **Combat tracker button handler**: Fixed click error `TypeError: menuBar.toggleCombatTracker is not a function` by routing tracker toggling through the combat bar manager path.
- **Combat bar control sounds**: Added sound hooks for combat controls: portrait scroll buttons use `SOUNDBUTTON09`; tracker toggle, previous/next turn, previous/next round, begin combat, end combat, and end turn use `SOUNDPOP02`.
- **Vote start error**: `VoteManager.startVote` debug log no longer references undefined `leaderData`; uses `getSettingSafely(MODULE.ID, 'partyLeader', null)` for the log payload.
- **Vote button on chat card**: `renderChatMessageHTML` hook callback is an arrow function so `this` was not `VoteManager`. Vote and Close handlers now call `VoteManager.castVote`, `VoteManager.closeVote`, and `VoteManager.activeVote` explicitly. Prevents "Cannot read properties of null (reading 'votes')" when clicking vote options in the chat card.
- **castVote after auto-close**: When the initiator's vote triggers "everyone voted" and `closeVote()` runs, `this.activeVote` is set to null before the code sent the vote update over the socket. `castVote()` now captures `votesToSync` (reference to `this.activeVote.votes`) before any `await` and uses it for `receiveVoteUpdate`, so the socket send no longer dereferences null.


## [13.5.1] - 2026-03-03 - MENUBAR REFACTOR & MANAGE UI

### Added

- **Manage UI flyout**: Start menu now includes a "Manage UI" submenu with "Show/Hide Interface" and "Enable/Disable Apply on Load". When Apply on Load is enabled, the core Foundry UI is automatically hidden when the client loads. New setting `canvasToolsHideUIOnLoad` (Themes & Experience group) and lang keys `canvasToolsHideUIOnLoad-Label` / `canvasToolsHideUIOnLoad-Hint`.
- **Secondary bar zones and info items**: The default secondary bar (tool-based system) now has **left**, **middle**, and **right** zones. Items can specify `zone: 'left' | 'middle' | 'right'` (default `'middle'`). Existing items without a zone default to middle for backward compatibility. **Info items** (`kind: 'info'`) are display-only: register with `label` and/or `value`, and update at any time with `updateSecondaryBarItemInfo(barTypeId, itemId, { value, label, borderColor, buttonColor, iconColor })`. This allows encounter-style bars (info on the sides, actions in the center) without custom templates. New API: `updateSecondaryBarItemInfo`, `hasQuickEncounterTool`, `openQuickEncounterWindow`. See `documentation/api-menubar.md` (§ Default Bar Zones and Item Kinds, § Updating Secondary Bar Info Items).
- **Encounter bar migration**: Encounter secondary bar now uses the default tool system (zones + info items + buttons) instead of a custom template. **Right zone**: Party CR, Monster CR, Difficulty (info items, updated when tokens change). **Middle zone**: Create Combat, Quick Encounter (when available), Reveal (GM-only buttons). **Left zone**: empty. Owned by `encounter-toolbar.js`; `menubar-encounter.hbs` removed. Difficulty badge shows icon + rating only (no "Difficulty" label), with icon and text colored by `EncounterManager.getDifficultyBorderColor()`; no border.

### Changed

- **Encounter difficulty badge**: Removed label "Difficulty"; badge now shows icon + rating only. Icon and value text both use difficulty rating color (`iconColor`). Border removed.
- **Info item `iconColor`**: `updateSecondaryBarItemInfo` now accepts `iconColor` (and `null` to clear). When set, both icon and value text use the color. Documented in `api-menubar.md`.
- **Menubar architecture**: Core left-zone tools (start menu, Settings, Refresh) are no longer registered inside `api-menubar.js`. They are now registered from `utility-core.js` via the public menubar API (`game.modules.get(...).api.registerMenubarTool`), matching the pattern used by external modules.
- **Ready-cycle timing**: Menubar API is bound synchronously at the start of Blacksmith's `ready` handler (before any `await`) so all ready callbacks can use it. `registerSettings()` is called before the first `await` so settings exist when utility-core and other callbacks run. `MenuBar.initialize()` is invoked at the start of ready (without await) and registers its own `Hooks.once('ready')` before any await so the menubar renders in the same ready cycle. Menubar API is re-applied after the main API merge so it is not overwritten by nulls.

### Removed

- **Encounter bar height fallback**: Removed `--blacksmith-menubar-secondary-encounter-height` from `styles/menubar.css`; encounter bar uses registration config height only, consistent with other modules.

### Fixed

- **Start menu / menubar not showing**: MenuBar's ready callback was registered after `await this._registerPartials()`, so when Blacksmith's ready yielded, the callback was never registered in time. The ready hook is now registered at the top of `MenuBar.initialize()` and async work (partials, loadLeader, registerDefaultTools, renderMenubar) runs inside that callback so the menubar renders correctly.
- **Apply on Load setting not registered**: utility-core's ready could run before `registerSettings()`, causing "canvasToolsHideUIOnLoad is not a registered game setting". Settings are now registered before the first await, and utility-core checks `game.settings.settings.has()` before reading the setting.


## [13.5.0] - 2026-03-08 - CURATOR MIGRATION

### Changed

- **Curator Migration**: Extracted Token Image Replacement, Portrait Image Replacement, Dead Token conversion, and Loot generation functionality into the new **Coffee Pub Curator** module. Blacksmith now exposes these features via integration when Curator is installed.
- **API Menubar Updates**: `api-menubar.js` now dynamically checks for the `coffee-pub-curator` module to populate token replacement and dead token context menu items.
- **Documentation Updates**: Updated `architecture-blacksmith.md` and `extraction-reassessment.md` to reflect the new Curator module. Renamed and updated `migration-curator.md` with the finalized migration plans.

### Removed

- **Loot Generation Code**: Removed `manager-image-cache.js`, `token-image-replacement.js`, `token-image-utilities.js`, `loot-utilities.js`, `ui-context-menu.js`, and all associated CSS/HBS files. These are now fully handled by Curator.
- **Settings and Localization Cleanup**: Removed all settings related to token image replacement, data weights, loot generation, dead tokens, and epic loot odds from Blacksmith's `settings.js` and `lang/en.json`.
- **Legacy Regent Cleanup**: Removed the unused `styles/panel-assistant.css` leftover from the Regent migration, including its import in `styles/default.css` and mentions in the architecture documentation.
- **Dead Migration Files**: Removed the old `_Migration` folder containing outdated backup files (`pin-icons.json`, `pin-transition.md`, `panel-notes.js`, etc.).





## [13.4.1] - 2025-03-03

### Changed

- **Herald/Broadcast cleanup – CSS and TODO**: Removed `--blacksmith-menubar-secondary-broadcast-height` from `styles/menubar.css` (broadcast bar height is now provided by Herald when it registers its secondary bar type). Removed the CRITICAL REVISIT TODO for this variable from `documentation/TODO.md`. Deleted `documentation/cleanup-broadcast-herald-legacy.md` (cleanup complete). Blacksmith no longer owns any broadcast bar configuration.

## [13.4.0] - 2025-03-03

### Added

- **Menubar Control API**: Exposed `renderMenubar(immediate)` so external modules can request a menubar re-render when settings or state change. Added `registerMenubarVisibilityOverride(moduleId, callback)` and `unregisterMenubarVisibilityOverride(moduleId)` so modules (e.g. Herald) can hide the menubar for specific users (e.g. broadcast/cameraman). Documented in `documentation/api-menubar.md` § Menubar Control API.
- **Secondary bar API**: Implemented `registerSecondaryBarTool(barTypeId, toolId)` in MenuBar (`api-menubar.js`). This method was already exposed on `module.api` but was missing from MenuBar; it registers which menubar tool toggles a given secondary bar so the menubar can sync the tool’s active state when the bar opens/closes. Documented in `documentation/api-menubar.md` § Registering Secondary Bar Toggle Tool.

### Changed

- **Broadcast – migrated to Coffee Pub Herald**: Broadcast (streaming/cameraman view, view modes, menubar visibility override) is now provided by the **Coffee Pub Herald** module (`coffee-pub-herald`). Blacksmith no longer initializes BroadcastManager; it only exposes the menubar visibility override API and secondary bar API that Herald uses. See Herald’s documentation and `documentation/registering-with-blacksmith.md` for integration.
- **Documentation – architecture and cleanup**: `documentation/architecture-blacksmith.md` — removed BroadcastManager from init list; Broadcast subsection now points to Coffee Pub Herald; removed broadcast from CSS import list and from god-module responsibilities; references table row "Broadcast mode" now points to Herald. `scripts/api-menubar.js` — comment updated from "BroadcastManager or Herald" to "Herald". `documentation/TODO.md` — "Tune Default Zoom Levels for Broadcast Modes" and "Broadcast: Combat Spectator Mode" removed (moved to Herald); added critical revisit for `--blacksmith-menubar-secondary-broadcast-height` in `styles/menubar.css` (decide whether Blacksmith or Herald should own it). `documentation/cleanup-broadcast-herald-legacy.md` — checklist marked complete.

### Fixed

- **Roll Configuration and Request a Roll – missing partial-unified-header**: When Regent was split into its own module, the unified header partial moved with Regent. Blacksmith's Roll Configuration window (`window-roll-normal.hbs`) and Request a Roll dialog (`window-skillcheck.hbs`) still reference `{{> "partial-unified-header" }}`, causing "partial partial-unified-header could not be found" on the published server. The partial (`unified-header.hbs`) is now copied back into Blacksmith at `templates/partials/unified-header.hbs` and registered at init as `partial-unified-header` via `_registerUnifiedHeaderPartial()` in `blacksmith.js`, before the roll system loads.
- **Pin "Use as Default" – event animations and sounds not saved**: When "Use as Default" was checked in Configure Pin, the saved design only included size, shape, style, text options, and allowDuplicatePins. Event animations and sounds (hover, click, double-click, add, delete) were omitted. The design object now includes `eventAnimations` so new pins of that module and type inherit the animations and sounds. Fix in `window-pin-config.js`.

### Removed

- **Broadcast feature**: Removed BroadcastManager, `scripts/manager-broadcast.js`, broadcast settings and language keys, broadcast CSS import, and all Broadcast-specific menubar registration from Blacksmith. Streaming and broadcast view are now provided by **Coffee Pub Herald** (`coffee-pub-herald`). Install and enable Herald for cameraman view, view modes, and broadcast bar.
- **Test V2 Window**: Removed dev-only test window (`scripts/window-test-v2.js`), its Window API registration (`blacksmith-test-window`), and the "Test V2 Window" toolbar button from the GM tools zone. The Application V2 template (`window-template.hbs`) and base class remain for real windows.


## [13.3.1] - 2026-03-05

### Fixed

- **Request a Roll API – GM-authoritative completion signaling**: `openRequestRollDialog({ onRollComplete })` integrations now work reliably when requests are initiated by players. Roll completion is now propagated across clients through a shared completion signal path, so GM-side consumers can resolve game state (scene flags, actor updates, etc.) without depending on callback ownership on the originating client.

### Changed

- **Request a Roll completion hook**: Added global hook `blacksmith.requestRollComplete` for cross-client integrations. Payload includes `messageId`, `message`, `messageData`, `tokenId`, `result`, `allComplete`, `requesterId`, and `rollerUserId`. Existing `onRollComplete` callback behavior remains supported for backward compatibility.
- **Request a Roll docs**: Updated `documentation/api-requestroll.md` to document local `onRollComplete` behavior vs. cross-client hook usage and the full completion payload contract.
- **Movement sound – play once per move**: Token movement (walking) sound no longer uses start/stop looping; the sound never stopped when movement ended. It now plays once per movement update when the token moves beyond the distance threshold. A TODO was added in `documentation/TODO.md` to fix the movement sound start/stop behavior (loop while moving, stop when idle) in a future release.
- **Party secondary bar – player visibility**: In the party menubar (player secondary bar), players now see only **Vote** (when they are the session leader) and **Statistics**. Deployment pattern, Deploy Party, and Experience are visible only to the GM. Vote is visible to the GM or the current session leader. Implemented via `visible` on party secondary bar items in `api-menubar.js` (`_registerPartyTools`).


## [13.3.0] - 2025-02-27

### Fixed

- **Roll Configuration window – closes after roll from chat card**: When a player clicked the roll button on a request-roll chat card and then rolled from the Roll Configuration window (advantage, normal, or disadvantage), the window sometimes stayed open. The window now always closes after a roll attempt: the success path closes the dialog once results are delivered, and the catch path now closes the dialog on error so the user is not left with a stuck window. Fix in `RollWindow._executeRoll()` (manager-rolls.js).

### Removed

- **OpenAI API and AI code from Blacksmith**: Removed `scripts/api-openai.js` and all OpenAI integration from the core module. The `module.api.openai` surface no longer exists on Blacksmith. AI tools (Consult the Regent, worksheets: Lookup, Character, Assistant, Encounter, Narrative) are now provided only by the optional module **coffee-pub-regent**, which registers its toolbar tools via Blacksmith’s toolbar API and exposes the OpenAI API on its own `module.api.openai`.

### Changed

- **Documentation**: `documentation/architecture-blacksmith.md` — load order and bootstrap no longer reference `api-openai.js` or `OpenAIAPI`; API table no longer lists `openai`; added pointer to coffee-pub-regent for AI/Regent features and link to `coffee-pub-regent/documentation/api-openai.md`. `documentation/api-core.md` — AI/OpenAI API link now points to Coffee Pub Regent’s OpenAI API doc instead of a Blacksmith-local api-openai.md. Consumers of the OpenAI API should use `game.modules.get('coffee-pub-regent')?.api?.openai` when the Regent module is enabled.
- **Window API and Application V2 guidance**: `documentation/api-window.md` — added “Application V2: Body injection and scripts” (scripts in injected body/partials do not run; use document-level delegation for body controls; options for legacy inline `onclick`). Troubleshooting now includes “Buttons or controls in the body do nothing” with pointer to that section. `documentation/architecture-window.md` — new §2a “Application V2 behavior: body injection and scripts” (injected `<script>` not executed; use delegation for body controls; two patterns for legacy inline handlers). `documentation/applicationv2-window/guidance-applicationv2.md` — new §3.6 “Inline onclick or script in a partial never runs” and §4 bullet that scripts in injected body/partials do not run (use delegation or register handlers on `window` from a load-time module).

## [13.2.13]

### Added
- **Request a Roll API – situational bonus and custom modifier**: `openRequestRollDialog(options)` now accepts `options.situationalBonus` (number) and `options.customModifier` (string). These values pre-fill the Roll Configuration window when a player opens it from the chat card. When using `options.actors` (silent or dialog), each actor may include `situationalBonus` and `customModifier` for that actor only; if omitted, the global options apply. Use per-actor modifiers when only some actors get a bonus (e.g. one of two players has +2 for harvest). Documentation: `api-requestroll.md` updated with parameters and examples.
- **Chat Card API – section-header**: Documented `.section-header` in `api-chatcards.md` as the sub-heading inside the card (e.g. "Requested Rolls", "Challengers"). Card structure table and examples now include section-header; theme preview and Handlebars templates updated.

### Changed
- **Roll Configuration window – default size**: Default dimensions changed from 500×450 to 600×500 (manager-rolls.js `RollWindow.defaultOptions`). Window remains resizable.
- **Request a Roll API – groupRoll and multiple actors**: Clarified `groupRoll` behavior in docs: when omitted, dialog mode leaves the checkbox unchecked; silent mode defaults to group roll when multiple actors are supplied unless `groupRoll: false` is passed.
- **Movement sound – same “movement stopped” rule as marching order**: Token movement sound now treats “movement stopped” as “no `updateToken` for N ms” (300 ms debounce), matching the marching-order logic in the same file. Removed the libWrapper on `Token.prototype._onDragLeftDrop`, the `stopToken` hook for movement sound, and the pending-stop workaround. Start/stop is driven only by `updateToken` and a per-token debounce timer so sound works consistently for drag and keyboard. Multiple tokens can still play movement sound at once (keyed by tokenId). Added defensive `tokenDocument._source?.x` / `_source?.y` fallbacks and try/catch in `handleMovementSounds`; when sound starts, a console message “Movement sound: started” is logged (not gated by debug).
- **Narrative journal – scene fields "None" handling**: `sceneparent`, `scenearea`, `sceneenvironment`, `scenelocation`, and `scenetitle` now treat `"None"` (case-insensitive), blank, or null as empty; those fields are omitted from the journal output so "(None)" never appears. `omitIfNone()` helper in common.js; prompt-narratives.txt updated to instruct that None or empty means omit.
- **Narrative journal – section intro and context intro HTML rendering**: `strSectionIntro` and `strContextIntro` now use triple braces in journal-narrative.hbs so HTML (e.g. `<ul><li>...</li></ul>`) renders instead of showing raw tags. Section intro wrapper changed from `<p>` to `<div class="narrative-section-intro">` to support block-level content.
- **Narrative journal – per-section context fields**: `contextadditionalnarration`, `contextatmosphere`, and `contextgmnotes` are now per-section (inside each section object) in the JSON structure. The template renders Extended Narrative, Notes and Strategies, and Atmosphere inside each section after its cards. Top-level values still apply as fallback when a section omits its own. Prompt updated; backward compatible with existing top-level context.

### Fixed
- **Global debug setting – debug messages no longer log when off**: `postConsoleAndNotification()` in api-core.js previously logged every call: the debug branch (with "DEBUG" in the title) ran only when both `blnDebug === true` and `COFFEEPUB.blnDebugOn` were true, but the "normal" branch ran for all other cases and always called `console.info`. So messages marked as debug still appeared when global debug was unchecked. An early return was added: when `blnDebug === true` and `!COFFEEPUB?.blnDebugOn`, the function returns without logging or notification. Debug-marked messages now only appear when the module’s global Debug Mode setting is on.
- **Encounter Toolbar – "Context around UUID" respects debug**: The "Context around UUID" log in encounter-toolbar.js was called with `blnDebug: false`, so it always logged. It now passes `blnDebug: true` so it is suppressed when global debug is off.

## [13.2.12]

### Fixed
- **Sound constants on BlacksmithConstants**: External modules calling `BlacksmithUtils.playSound(BlacksmithConstants.SOUNDNOTIFICATION01, 0.7)` received "playSound called with invalid sound: sound" because sound path constants (SOUNDNOTIFICATION01, SOUNDVOLUMENORMAL, etc.) lived only on `COFFEEPUB`, not on `api.BLACKSMITH` (exposed as `BlacksmithConstants`). When the API is built, `assetLookup.getAllConstants()` is now merged onto `BLACKSMITH` so `BlacksmithConstants.SOUNDNOTIFICATION01` and other generated constants exist and playSound works when used from other modules.

## [13.2.11]

### Added
- **Sound API – duration option**: Optional 5th parameter `duration` (seconds) on `playSound(sound, volume, loop, broadcast, duration)`. When set, the sound loops for that many seconds then stops. When `broadcast` is true, all clients stop after the duration via socket (`playSoundWithDuration` handler). New `playSoundLocalWithDuration(sound, volume, duration)` for local timed playback. Socket handler registered in manager-sockets; manager-utilities wrapper and API doc (`api-core.md`) updated with Sound playback subsection and duration examples.
- **Item import – straight-quote normalizer**: Prompts (Artificer, consumables, loot) now instruct to use only straight ASCII apostrophes (') and no curly/typographic apostrophes or smart quotes. New `normalizeStraightQuotesForJson(str)` in blacksmith.js replaces curly/smart single and double quotes (U+2018, U+2019, U+201A, U+201B, U+2032, U+201C–U+201F) with straight equivalents; applied to the item JSON string before `JSON.parse()` in the Item Directory import dialog so pasted or file-loaded JSON parses correctly even when the model outputs typographic quotes.


## [13.2.10]

### Added
- **Menubar overflow button**: When the middle zone has more tools than fit, a right-justified ellipsis icon appears; clicking it opens a dropdown with the overflowed tools. Overflow detection uses ResizeObserver and updates on window resize.
- **Request a Roll API – silent mode**: `openRequestRollDialog({ silent: true, ... })` creates the roll request and posts it to chat without opening the dialog. Requires `initialValue` or `initialSkill`; actors come from `initialFilter` ('party' | 'selected') or from `options.actors`. Returns a Promise resolving to `{ message, messageId }`. If no actors are found, the API falls back to opening the dialog and resolves with `{ message: null, messageId: null, fallbackDialog }`. `options.actors` accepts Foundry Actor documents (resolved to canvas tokens by actor id) or token-centric objects `{ id: tokenId, actorId, name, group }`. Documentation: `documentation/api-requestroll.md` updated with silent mode, callback payload, and accepted actor shapes.

### Changed
- **Menubar – Vote, Statistics, Experience moved to Party bar**: Vote, Party Statistics, and Experience are now in the party secondary menubar instead of the primary menubar. Open the party bar to access them.
- **Menubar notifications**: Notifications are right-justified and the notification area now flexes to the size of its contents.

### Fixed
- **Skill Check dialog – undefined hp crash**: When opening the Request a Roll (Skill Check) dialog, actors without `system.attributes.hp` (e.g. vehicles, some NPCs, or alternate data structures) caused "Cannot read properties of undefined (reading 'value')". `getData()` now uses optional chaining and fallbacks for `hp`, `level`, and `class` so the dialog renders safely for all actor types.
- **Request a Roll API – onRollComplete not invoked**: When another module opened the dialog with `onRollComplete`, the callback was never called after players rolled. Callbacks are now stored by message id when the roll request is created and invoked from `handleSkillRollUpdate` when results are delivered; payload is `{ message, messageData, tokenId, result, allComplete }`. Callback is removed when `allComplete` is true.
- **Request a Roll – handleSkillRollUpdate type check**: The guard `if (!flags?.type === 'skillCheck')` was always false (wrong operator precedence). Replaced with `if (flags?.type !== 'skillCheck')` so non–skill-check messages are skipped correctly.
- **Skill Check dialog – _getToolProficiencies and getData()**: In v13, `this.element` can be native DOM or unset during `getData()`. `_getToolProficiencies()` now normalizes element (jQuery vs native), guards with `if (!element || typeof element.querySelectorAll !== 'function') return []`, and uses `querySelectorAll`/`forEach` so the tool list populates correctly and no "Cannot read properties of undefined (reading 'querySelectorAll')" occurs. Canvas access in `getData()` and `activateListeners()` now uses `canvas?.tokens?.placeables ?? []` and `canvas?.tokens?.controlled` with optional chaining to avoid errors when no scene or canvas is ready.
- **Request a Roll (silent) – options.actors with Actor documents**: Silent mode treated `options.actors` as token-centric only (`id` = token id, `actorId` required), so callers passing Actor documents (e.g. from `_getSelectedCanvasActors()`) were filtered out and "no actors found" was thrown. The API now accepts both token-centric objects and Actor documents (or `{ id: actorId, name }`); for actor-centric items it resolves each to canvas token(s) by actor id and builds the roll request from those tokens.


## [13.2.9]

### Added
- **Request a Roll API – groupRoll option**: `openRequestRollDialog(options)` now accepts `options.groupRoll` (boolean). When the dialog is opened via the API, if `groupRoll` is omitted it defaults to false (unchecked); when opened from the UI, the saved preference is used. JSDoc and `documentation/api-requestroll.md` updated.
- **Wildcard token path resolution**: Foundry’s multiple-variant token paths (e.g. `arch-hag-*.webp`) are now resolved to a concrete file for display. New `resolveWildcardPath(path)` in api-core.js (FilePicker browse + regex + random match). Encounter toolbar: portrait in `_getMonsterDetails()` is resolved when it contains `*`. Token deployment: `deployTokensSequential()` resolves `previewTokenData.textureSrc` before showing the placement ghost so the ghost and result cards use a real path.
- **Image Replacement – Tag Match weight**: New slider in Image Replacement Data Weights (0–100, default 25) controls how much file tag overlap contributes to relevance. Matching now scores overlap between token/actor data (and, in portrait mode, token image filename words) and the file’s primary/secondary tags; this weight makes tags (e.g. female, scholar, farmer) tunable for both token and portrait results. Setting: `tokenImageReplacementWeightTags`; lang: "Tag Match" with hint.
- **Image Replacement – Portrait uses token image filename**: Portrait matching now uses words from the token’s current image path as extra context. When a portrait is chosen for a token (or on "update dropped"), words are extracted from the token texture filename (e.g. `female-farmer-01.webp` → female, farmer) and merged into tag matching, so portraits that share those words in name or tags rank higher. New helper `ImageCacheManager.extractWordsFromTokenFilename(path)`; token filename terms passed into `_applyUnifiedMatching` / `_calculateRelevanceScore` in the portrait window flow and in `_processPortraitImageReplacement`.
- **Image Replacement – Tag match sum scoring**: Tag contribution to relevance now sums each matching tag’s score instead of taking the best single match, so files with more tag matches (e.g. female + farmer) rank above those with fewer (e.g. farmer only).
- **Image Replacement – Filter garbage tags**: New setting "Filter Garbage Tags" (default on) skips adding tags that look like dimensions (16X32), variant codes (001A, A1), or all-digit parts when scanning. New setting "Ignored Tag Patterns" (comma-separated, * wildcard) lets users exclude additional tags. Both apply to token and portrait scanning. `GARBAGE_TAG_PATTERNS` and `_isGarbageTagPart()` in manager-image-cache.js; `_shouldIgnoreTagByPattern()` for custom patterns.

### Changed
- **Image Replacement – Unified ignore settings**: One set of "Ignored Folders", "Ignored Words", and "Deprioritized Words" (under Token Image Replacement) now applies to both token and portrait. Removed portrait-specific settings: portraitImageReplacementIgnoredFolders, portraitImageReplacementIgnoredWords, portraitImageReplacementDeprioritizedWords. Lang hints note they apply to both.
- **Image Replacement – Monitor folder removed**: Removed "Monitor Image Folder for Changes" (auto-update) for both token and portrait. Cache is no longer checked for folder changes on load; scans run only when the user clicks "Update Images" in the replacement window. Removed tokenImageReplacementAutoUpdate and portraitImageReplacementAutoUpdate and _checkForIncrementalUpdates().

### Fixed
- **Image Replacement – %20 in tags**: FilePicker can return URL-encoded paths (e.g. `%20` for spaces). Added `_safeDecodePath(path)` in manager-image-cache.js and decode at the start of `_processFileInfo()` so metadata and tags use readable names (spaces instead of `%20`).
- **Image Replacement – dropdown white on tan**: Sort dropdown options (e.g. "Sort by Relevance", "Alphabetical: A to Z") now use the dark theme (background `#232323`, color `#e0e0e0`); selected option uses the green accent. Styling in `window-token-replacement.css` for `select option` and `option:checked`.
- **Token Image Replacement – storeOriginalImage on create**: When tokens are created (e.g. during encounter deployment), `tokenDocument.texture.src` can be null. `TokenImageUtilities.storeOriginalImage()` now guards on `texture.src` (and `texture.path`) and returns without storing when missing, preventing "Cannot read properties of null (reading 'split')".

## [13.2.8] - Release fix

## [13.2.7]

### Added
- **Request a Roll API**: The Request a Roll (Skill Check) dialog is exposed for other modules. `module.api.openRequestRollDialog(options)` and `BlacksmithAPI.openRequestRollDialog(options)` open the dialog with optional pre-fill. Options: `title` (dialog window and roll/card header), `initialType` (`'skill'` | `'ability'` | `'save'`), `initialValue` or `initialSkill` (id or friendly name, e.g. `'perception'`), `dc`, `initialFilter` (`'party'` | `'selected'`), plus `callback`, `onRollComplete`, `actors`. When `initialFilter` is `'party'`, all visible party actors are pre-selected as challengers; when `initialType`/`initialValue` are set, the correct tab is shown and that roll type is pre-selected (friendly names like `'perception'` are resolved to system CONFIG ids, e.g. `prc`). Documentation: `documentation/api-requestroll.md` with full parameter table, examples (including party perception DC 12), and roll type reference.

### Changed

### Fixed
- **Request a Roll – dialog and card title**: The API `title` option was not applied to the dialog window (options are now passed into `super(options)` so the Application uses it) and was not used for the chat card header. The passed `title` is now stored as `apiRollTitle` and used as `messageData.rollTitle` when creating the roll request, so both the dialog title and the card's main title show the custom text (e.g. "Spot the trap").
- **Request a Roll – party and skill pre-selection**: With `initialFilter: 'party'`, only the Party tab was active; party actors were not selected as challengers. Now all visible party actor items are given the challenger state (selected, cpb-group-1, swords icon) and `_updateToolList()` is called. With `initialType`/`initialValue` (e.g. Perception), the Skill tab was shown but the skill item was not selected because the dialog defaulted to the Quick tab and the selector used a friendly name instead of the system id. The roll-type filter is now set to the correct tab (skill/ability/save) before selecting the item, and `_resolveRollTypeValue(type, value)` resolves friendly names (e.g. `'perception'`) to CONFIG ids (e.g. `'prc'`) so the matching list item is found and selected.

## [13.2.6]

### Added
- **Monster deployment API**: Encounter toolbar’s monster/NPC deployment is exposed so other modules can deploy to the canvas (GM only). `module.api.deployMonsters(metadata, options)` and `BlacksmithAPI.deployMonsters(metadata, options)` accept `metadata`: `{ monsters?: Array<string|{uuid}>, npcs?: Array<...> }` and optional `options`: `deploymentPattern`, `deploymentHidden`, `position` `{ x, y }` (skips click-to-place), `isAltHeld`. Encounter toolbar: public `deployMonsters(metadata, options)` and `_deployMonsters(metadata, overrides)` with overrides for pattern, hidden, and position. Token API: `normalizeActorUUIDs(actorUUIDs)` and `deployTokens` / `deployTokensSequential` now accept UUID strings or objects with `.uuid`. Documentation: `api-core.md` “Monster deployment API” section and “Available now” bullet.
- **Journal page pins**: Journal page sheets now get a “Pin page” header control (with hook + MutationObserver fallback) that creates or reuses an unplaced Blacksmith pin of type `journal-page`, enters click-to-place mode with crosshair cursor (Esc/right-click to cancel), reloads pins after placement, and stores `pinId`/`sceneId` on the page. Double-clicking a placed journal-page pin opens its linked journal page.
- **Token placement preview**: During token deployment (sequential or single-token batch), a ghost token now follows the cursor so the user can see the token's size and grid footprint before clicking. `getTargetPosition(allowMultiple, options)` accepts optional `options.previewTokenData`: `{ width, height, textureSrc }`. New helper `getPreviewDataFromActor(actor)` returns that data from an actor's prototype token. Sequential deployment passes preview data per token; the ghost is drawn on the token layer, snaps to grid, and is removed on click or cancel.

## [13.2.5]

### Added
- **Pin label “Chars per line”**: New setting in Configure Pin (TEXT FORMAT) to limit characters per line before wrap; breaks at word boundary. Value is a character count (e.g. 15 or 100); 0 = single line. Stored as `textMaxWidth` on pin data. Schema, config window, renderer, manager merge, and API docs updated.
- **Pin center text (`iconText`)**: Pins can now use plain text in the center instead of an icon or image. Pass `iconText: '1'` (or any string) to display text in the pin; it inherits the same styling as Font Awesome icons (iconColor, scaling). `iconText` takes precedence over `image` when both are set. Schema, renderer, manager merge, and API docs updated.
- **Image Replacement “Update Canvas” action**: Added a button beside the Delete/Scan controls that re-runs token/portrait replacements for every token on the canvas while honoring the existing enabled switches, filters, and variability logic so a GM can refresh a scene without re-dropping tokens.
- **Roll table prompts – compendium items by rarity**: The “[ADD-COMPENDIUM-ITEMS-HERE]” list (Copy Template → Compendium Items) now groups items by D&D 5e rarity under each compendium. Uses full item documents (`getDocuments()`) and `system.rarity`; output format is compendium id, then “RARITY: Common”, “RARITY: Uncommon”, etc., each followed by comma-separated item names. Helpers: `getItemRarityKey`, `formatRarityLabel`, `ITEM_RARITY_ORDER`. Prompt text updated to describe the grouped format.
- **Roll table prompts – compendium actors by CR**: The “[ADD-COMPENDIUM-ACTORS-HERE]” list (Copy Template → Compendium Actors) now groups actors by Challenge Rating under each compendium. Uses full actor documents and `system.details.cr` (or `.value`); output format is compendium id, then “CR: 0”, “CR: 1/8”, “CR: 1/4”, etc., each followed by comma-separated actor names. Helpers: `getActorCr`, `formatCrLabel`, `parseCrToNumber`, `CR_SORT_OTHER`. Prompt text updated; typo “compendiume” fixed.
- **Combat assessment API**: Party CR, monster CR, and encounter difficulty (same logic as the encounter toolbar) are now exposed for other modules. On `module.api`: `getPartyCR()`, `getMonsterCR(metadata)`, `calculateEncounterDifficulty(partyCR, monsterCR)`, `getCombatAssessment(metadata)` (returns `{ partyCR, monsterCR, partyCRDisplay, monsterCRDisplay, difficulty, difficultyClass }`), plus `parseCR` and `formatCR`. Encounter toolbar: new public `calculateEncounterDifficulty()` and `getCombatAssessment()`. Drop-in bridge (`BlacksmithAPI`): `getCombatAssessment()`, `getPartyCR()`, `getMonsterCR()`, `calculateEncounterDifficulty()`. Documentation: `api-core.md` updated with “Combat assessment API” section and usage examples.

### Changed
- **Pin label “Max length” → “Max characters”**: Configure Pin TEXT FORMAT field renamed from “Max length” to “Max characters” (still truncates label text at that character count with ellipsis; 0 = no limit).
- **Pin label wrap – character-based only**: When Chars per line &gt; 0, the label element’s width is set to `${textMaxWidth}ch` so wrapping is driven by character count, not the pin’s pixel width. Label is no longer constrained by the pin container (~53px); `white-space: pre-line` and our word-boundary newlines (or browser wrap within the `ch` width) control line breaks.
- **Image Replacement tags split**: Image cache now keeps tiered tags (`primaryTags` for structured metadata + `secondaryTags` for the remaining filename/folder keywords plus a `tagTypes` map) so both cache storage and the UI know which tags come from the spinner-controlling sliders vs. descriptive leftovers. The Image Replacement window renders primary/secondary rows, counts/sorts tags per group, and favorites use the new tag helpers; a TODO hints at a future right-click menu for tag actions such as “Add to Ignored.”
- **Image Replacement cache now warns instead of deleting**: Token/portrait caches stay loaded when metadata (version, configured roots, fingerprint) drift, `_checkForIncrementalUpdates` just marks the new `needsRescan` flag, and the UI surface now shows an info banner advising the GM to rescan—your previous cache isn’t deleted and the 30-day auto-expiry was removed, so it only rebuilds when someone explicitly hits “Scan for Images.”

### Fixed
- **Chars per line not applied**: `textMaxWidth` was only accepted when `typeof === 'number'`, so values from storage or form (e.g. string `"100"`) were dropped. Schema `applyDefaults()` and manager `_applyPatch()` now coerce number or string to a non-negative integer so the setting is persisted and used.
- **Pin label width always ~53px**: We only cleared `maxWidth` and never set `width`; the label lives inside the pin div, so with `width: auto` it was limited by the pin’s pixel width. When Chars per line &gt; 0 we now set the label element’s width in `ch` units (e.g. `100ch`) so the label has an explicit character-based width and wraps correctly.
- **Source newlines overriding character wrap**: Pin text that already contained newlines (e.g. from a note) was shown as multiple lines regardless of Chars per line. When applying character wrap we now normalize whitespace (e.g. `replace(/\s+/g, ' ')`) so only our character-count / word-boundary logic (and the `ch` width) control line breaks.
- **Context menu flyout disappearing**: The submenu (e.g. Animate on pin context menu) could close as soon as the mouse left the parent item when moving into the flyout, because crossing the gap fired `mouseleave` with `relatedTarget` null. Flyout close is now delayed 200ms and cancelled if the pointer enters the submenu or the parent item, so the flyout stays open when moving into it.

## [13.2.4]

### Changed
- **Chat card legacy themes**: Removed support for `cardsred`, `cardsgreen`, and `cardsblue`. Only `cardsdark` remains for legacy chat cards. All related CSS was removed from legacy card styles.
- **Legacy card CSS merge**: Merged `cards-themes-legacy.css` into `cards-layout-legacy.css` (layout + theme for cardsdark in one file). Removed `cards-themes-legacy.css` and its import from `default.css`.
- **Legacy card CSS shorthand**: Padding and margin in `cards-layout-legacy.css` converted to single-line shorthand (e.g. `padding: 5px 10px`); `border-radius` values simplified where applicable.
- **Common card layout – namespaced typography**: In `cards-common-layout.css`, typography rules (hr, h1–h3, ol, ul, li, p, table, pre) and markdown overrides are now scoped under `.blacksmith-card` instead of `#cards-wrapper-cardsdark`. Markdown class names simplified from `coffee-pub-bibliosoph-markdown-*` to `markdown-*` (e.g. `markdown-div`, `markdown-h1`, `markdown-p`, `markdown-blockquote`, `markdown-ul`, `markdown-ol`, `markdown-hr`).
- **markdownToHtml() output**: `api-core.js` `markdownToHtml()` now emits the new markdown class names (`markdown-hr`, `markdown-h1`–`markdown-h3`, `markdown-ul`, `markdown-ol`, `markdown-li`, `markdown-p`, `markdown-blockquote`, `markdown-div`). Legacy `cards-legacy.css` markdown overrides updated to use `.markdown-*` selectors.
- **User/token card layout – namespaced**: User and token block styles in `cards-common-layout.css` moved to `.blacksmith-card` with simplified class names: `container-user` (was `#cards-user-cardsdark`), `token-image`, `token-text-wrapper`, `token-name`, `token-character`. Legacy `#cards-*` rules remain in `cards-legacy.css` for existing chat messages. `window-common.css` now includes `.blacksmith-card .container-user.bibliosoph-option-div-selected` (and img) for the new namespaced cards alongside existing `#cards-user-cardsdark` selected-state rules.

## [13.2.3] 

### Added
- **Broadcast Combatant Mode**: Added a new broadcast view mode that frames all visible combatant tokens (from the combat tracker) on the current scene, mirroring Spectator behavior but using combatants instead of party tokens.
- **Icon Color Pin Setting**: Added `style.iconColor` to pin data (default: `'#ffffff'`). Configure Pin window now includes an "Icon Color" field (text + color picker) alongside Background and Border. Applies to Font Awesome icons only; image URLs are not tinted. Schema (`pins-schema.js`), config window, renderer, and API documentation (`api-pins.md`) updated with examples and default-design support.
- **Context Menu Stylesheet**: Pin context menu styles moved from inline JS to `styles/menu-context-global.css`. Menu container, separator, and item (including hover) styling are now in CSS for easier theming; `left`/`top` remain in JS for positioning.
- **Context Menu Zones**: Pin right-click menu split into three zone divs—`context-menu-zone-module`, `context-menu-zone-core`, `context-menu-zone-gm`—so each can be styled independently. Module zone holds registered items, core holds built-in actions, GM zone holds GM-only bulk-delete options. Separators are rendered between zones when the next zone has items.

### Changed
- **Asset Updates**: Updated portrait images
- **Core Menu Order**: Pin context menu core items reordered to: Ping Pin, Bring Players Here, Configure Pin, Delete Pin.
- **Context Menu Icons**: Ping Pin uses `fa-signal-stream`; Bring Players Here uses `fa-location-crosshairs`. All delete actions (Delete Pin, Delete All of Type, Delete All Pins) use the same trash icon (`fa-trash`).
- **Menubar API – Optional Title**: `registerMenubarTool()` no longer requires `title`. If omitted, it defaults to the tool's `name`. Validation now checks for `undefined` only (allows `null`, empty strings, and functions). Enables external modules to register left-zone buttons without a title. Documentation (`api-menubar.md`) and JSDoc updated accordingly.
- **Pins API Documentation – Unplaced as Primary**: API documentation (`documentation/api-pins.md`) updated to treat unplaced pins as the normal, primary use case. Added "Unplaced Pins" section; documented `place()`, `unplace()`, `list({ unplacedOnly: true })`, and hooks `blacksmith.pins.created`, `blacksmith.pins.placed`, `blacksmith.pins.unplaced`. PinData and method docs now clarify optional `x`/`y`/`sceneId` and lookup order (unplaced first, then scenes). Examples and status line updated accordingly.

### Fixed
- **Broadcast Pan/Zoom DPR Mismatch**: Normalized broadcast viewport sizing to CSS pixels (instead of renderer pixels) so Mac/HiDPI and Windows compute identical pan/zoom and map-view framing.
- **Player Pin Update – World Setting Permission**: Fixed "User lacks permission to update Setting" when a **non-GM** with edit permission called `pins.update()` for an **unplaced** pin (e.g. note save without "Use as Default"). Unplaced pins are stored in the **world** setting `pinsUnplaced`; only GMs can write world settings. Non-GM unplaced-pin updates now go through `requestGM('updateUnplaced', { pinId, patch, options })` so the GM client performs the write. No world or scene setting write is attempted on the player client. API docs and JSDoc updated; `_setUnplacedPins` is documented as GM-only.
- **Player Pin Place / Unplace – Same Setting Permission**: Fixed the same "lacks permission to update Setting" when a **non-GM** called `pins.place(pinId, { sceneId, x, y })` (e.g. clicking the map to place a note pin) or `pins.unplace(pinId)`. Both operations write the world setting (remove/add from unplaced) and scene flags. Non-GM callers now use `requestGM('place', { pinId, placement })` and `requestGM('unplace', { pinId })` so the GM client performs the writes; the player's canvas is updated with the result (pin appears or is removed).
- **Player Pin Delete (Scene/Setting Permission)**: Fixed "User lacks permission to update Scene" when a **non-GM** with edit permission used the "Delete Pin" context menu (placed or unplaced). Delete writes scene flags (placed) or the world setting (unplaced); only GMs can write. Non-GM deletes now go through `requestGM('delete', { sceneId, pinId, options })` so the GM client performs the write; the player's canvas removes the pin locally after success. A GM must be online for player deletes to succeed.
- **Player Pin Config Save (Scene Permission)**: Fixed "User lacks permission to update Scene" when a player with edit permission tried to save from Configure Pin on a **placed** pin. Scene flags require Scene update permission (GM only). Placed-pin updates by non-GM users now go through `requestGM('update', …)` so the GM client performs the write; the updated pin is returned and the player's canvas is refreshed immediately. A GM must be online for player saves to succeed.
- **Ping Pin Context Menu – Broadcast**: The "Ping Pin" context menu item now passes `broadcast: true` to `pins.ping()`, so all connected players who can view the pin see the animation (previously only the clicking player saw it). "Bring Players Here" already broadcast; Ping Pin now matches that behavior.
- **Broadcast Ping Socket Handler**: Fixed "PinDOMElement.ping is not a function" when a client received a broadcast ping via the `pingPin` socket handler. The handler was calling `PinDOMElement.ping()`; the public `ping()` method lives on `PinRenderer`. The handler now calls `PinRenderer.ping()` so the animation and sound run correctly on receiving clients.
- **Icon Color Not Updating on Canvas**: Fixed icon color change not appearing on the pin until re-opening Configure Pin. CSS rule `.blacksmith-pin-icon[data-icon-type="fa"] i { color: #ffffff }` overrode the wrapper's color. The renderer now sets `style.color` on the inner `<i>` as well as the wrapper so the chosen icon color applies immediately.
- **GM Proxy Socket Handler**: Fixed "No socket handler with the name 'blacksmith-pins-gm-proxy' has been registered" when a non-GM called `pins.requestGM()`. The handler was only registered on the calling client; SocketLib's `executeAsGM` runs the handler on the GM client. The pins GM-proxy handler is now registered on all clients when the socket is ready (`Hooks.once('blacksmith.socketReady')` in `manager-pins.js`), so the GM has the handler before any request.
- **Configure Pin Window for Unplaced Pins**: Fixed "Pin not found" when opening the Configure Pin window for an unplaced pin. `PinConfigWindow` no longer defaults `sceneId` to the active scene when not provided; `getData()` calls `PinManager.get()` without `sceneId` when appropriate, so the unplaced store is checked first, then all scenes. `pins.configure(pinId)` now works for unplaced pins (the primary use case).
- **Monster Mapping / Targeted Indicator Setting Conflict**: Fixed a bug where token image replacement stored monster mapping data in the same setting key (`targetedIndicatorEnabled`) used by the targeting indicator toggle. The targeting feature expects a Boolean; monster mapping stored a large Object, which could break the targeting check. Monster mapping now uses a dedicated setting key `tokenImageReplacementMonsterMapping`. The loader was renamed from `_loadtargetedIndicatorEnabled()` to `_loadMonsterMappingData()`. Migration logic moves existing monster mapping data from the old key to the new key on first load. `_loadMonsterMapping()` reads from the new key with fallback to the old key for compatibility.

## [13.2.2] - Pin Configuration Migration

### Added
- **Broadcast Combatant Mode**: Added a new broadcast view mode that frames all visible combatant tokens (from the combat tracker) on the current scene, mirroring Spectator behavior but using combatants instead of party tokens.
- **Icon Color Pin Setting**: Added `style.iconColor` to pin data (default: `'#ffffff'`). Configure Pin window now includes an "Icon Color" field (text + color picker) alongside Background and Border. Applies to Font Awesome icons only; image URLs are not tinted. Schema (`pins-schema.js`), config window, renderer, and API documentation (`api-pins.md`) updated with examples and default-design support.
- **Context Menu Stylesheet**: Pin context menu styles moved from inline JS to `styles/menu-context-global.css`. Menu container, separator, and item (including hover) styling are now in CSS for easier theming; `left`/`top` remain in JS for positioning.
- **Context Menu Zones**: Pin right-click menu split into three zone divs—`context-menu-zone-module`, `context-menu-zone-core`, `context-menu-zone-gm`—so each can be styled independently. Module zone holds registered items, core holds built-in actions, GM zone holds GM-only bulk-delete options. Separators are rendered between zones when the next zone has items.

### Changed
- **Asset Updates**: Updated portrait images
- **Core Menu Order**: Pin context menu core items reordered to: Ping Pin, Bring Players Here, Configure Pin, Delete Pin.
- **Context Menu Icons**: Ping Pin uses `fa-signal-stream`; Bring Players Here uses `fa-location-crosshairs`. All delete actions (Delete Pin, Delete All of Type, Delete All Pins) use the same trash icon (`fa-trash`).
- **Menubar API – Optional Title**: `registerMenubarTool()` no longer requires `title`. If omitted, it defaults to the tool's `name`. Validation now checks for `undefined` only (allows `null`, empty strings, and functions). Enables external modules to register left-zone buttons without a title. Documentation (`api-menubar.md`) and JSDoc updated accordingly.
- **Pins API Documentation – Unplaced as Primary**: API documentation (`documentation/api-pins.md`) updated to treat unplaced pins as the normal, primary use case. Added "Unplaced Pins" section; documented `place()`, `unplace()`, `list({ unplacedOnly: true })`, and hooks `blacksmith.pins.created`, `blacksmith.pins.placed`, `blacksmith.pins.unplaced`. PinData and method docs now clarify optional `x`/`y`/`sceneId` and lookup order (unplaced first, then scenes). Examples and status line updated accordingly.

### Fixed
- **Broadcast Pan/Zoom DPR Mismatch**: Normalized broadcast viewport sizing to CSS pixels (instead of renderer pixels) so Mac/HiDPI and Windows compute identical pan/zoom and map-view framing.
- **Player Pin Update – World Setting Permission**: Fixed "User lacks permission to update Setting" when a **non-GM** with edit permission called `pins.update()` for an **unplaced** pin (e.g. note save without "Use as Default"). Unplaced pins are stored in the **world** setting `pinsUnplaced`; only GMs can write world settings. Non-GM unplaced-pin updates now go through `requestGM('updateUnplaced', { pinId, patch, options })` so the GM client performs the write. No world or scene setting write is attempted on the player client. API docs and JSDoc updated; `_setUnplacedPins` is documented as GM-only.
- **Player Pin Place / Unplace – Same Setting Permission**: Fixed the same "lacks permission to update Setting" when a **non-GM** called `pins.place(pinId, { sceneId, x, y })` (e.g. clicking the map to place a note pin) or `pins.unplace(pinId)`. Both operations write the world setting (remove/add from unplaced) and scene flags. Non-GM callers now use `requestGM('place', { pinId, placement })` and `requestGM('unplace', { pinId })` so the GM client performs the writes; the player's canvas is updated with the result (pin appears or is removed).
- **Player Pin Config Save (Scene Permission)**: Fixed "User lacks permission to update Scene" when a player with edit permission tried to save from Configure Pin on a **placed** pin. Scene flags require Scene update permission (GM only). Placed-pin updates by non-GM users now go through `requestGM('update', …)` so the GM client performs the write; the updated pin is returned and the player's canvas is refreshed immediately. A GM must be online for player saves to succeed.
- **Icon Color Not Updating on Canvas**: Fixed icon color change not appearing on the pin until re-opening Configure Pin. CSS rule `.blacksmith-pin-icon[data-icon-type="fa"] i { color: #ffffff }` overrode the wrapper's color. The renderer now sets `style.color` on the inner `<i>` as well as the wrapper so the chosen icon color applies immediately.
- **GM Proxy Socket Handler**: Fixed "No socket handler with the name 'blacksmith-pins-gm-proxy' has been registered" when a non-GM called `pins.requestGM()`. The handler was only registered on the calling client; SocketLib's `executeAsGM` runs the handler on the GM client. The pins GM-proxy handler is now registered on all clients when the socket is ready (`Hooks.once('blacksmith.socketReady')` in `manager-pins.js`), so the GM has the handler before any request.
- **Configure Pin Window for Unplaced Pins**: Fixed "Pin not found" when opening the Configure Pin window for an unplaced pin. `PinConfigWindow` no longer defaults `sceneId` to the active scene when not provided; `getData()` calls `PinManager.get()` without `sceneId` when appropriate, so the unplaced store is checked first, then all scenes. `pins.configure(pinId)` now works for unplaced pins (the primary use case).
- **Monster Mapping / Targeted Indicator Setting Conflict**: Fixed a bug where token image replacement stored monster mapping data in the same setting key (`targetedIndicatorEnabled`) used by the targeting indicator toggle. The targeting feature expects a Boolean; monster mapping stored a large Object, which could break the targeting check. Monster mapping now uses a dedicated setting key `tokenImageReplacementMonsterMapping`. The loader was renamed from `_loadtargetedIndicatorEnabled()` to `_loadMonsterMappingData()`. Migration logic moves existing monster mapping data from the old key to the new key on first load. `_loadMonsterMapping()` reads from the new key with fallback to the old key for compatibility.


## [13.2.1] - Pin System Enhancements

### Added
- **Drop Shadow Property**: Added `dropShadow` property to pin data (default: `true`). Adds a subtle drop shadow to pins for better visual depth and separation from the canvas background. Shadow styling is controlled via CSS variable `--blacksmith-pin-drop-shadow` for easy customization (default: `drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))`).
- **Enhanced API Documentation**: Added comprehensive shape examples to API documentation showing all three pin shapes (`'circle'`, `'square'`, `'none'`) with code examples demonstrating usage for each shape type.
- **Pin Animation Broadcasting**: Implemented `broadcast` parameter for `pins.ping()` method. When `broadcast: true`, animations are shown to all connected users who have permission to view the pin. Uses Blacksmith socket system with automatic permission filtering.
- **Bring Players Here**: Added "Bring Players Here" to pin context menu. Pans all connected players to the pin and plays ping animation. Available to all users (for now). Uses `broadcast` option on `pins.panTo()` method.
- **`pins.exists()` Helper**: Added `pins.exists(pinId, options?)` method to check if a pin already exists on a scene before attempting creation. Helps modules avoid duplicate ID errors by checking first.
- **`pins.refreshPin()` Method**: Added `pins.refreshPin(pinId, options?)` method to force a single pin to rebuild its icon element. Useful for edge cases where `update()` doesn't fully refresh the visual. Note: This should rarely be needed as `update()` now automatically handles icon/image type changes.

### Changed
- **Pan/Zoom Performance**: Removed pan/zoom hide/show logic. Pins now remain visible during canvas pan and zoom operations. Pure DOM rendering handles position updates smoothly without needing to hide pins, providing better UX and simpler code.
- **Pin Animation System**: Added `pins.ping(pinId, options)` method to animate pins and draw attention. Supports 11 animation types including new `'ping'` combo animation (scale-large with sound + ripple - recommended for navigation), plus pulse, ripple, flash, glow, bounce, scale-small/medium/large, rotate, and shake. Configurable loops, optional sound effects, and broadcast support. Animations use CSS keyframes for smooth performance.
- **Context Menu Reorganization**: Restructured pin right-click menu with separator between module-registered commands and built-in commands. Built-in commands now appear in order: "Bring Players Here", "Ping Pin", "Delete Pin". Removed test animation menu items (Bounce, Pulse, Ripple, Flash, Glow, Scale Small/Medium/Large, Rotate, Shake) from production menu.
- **Pin Pan-to-Location API**: Added `pins.panTo(pinId)` method to pan the canvas to a pin's location. Supports optional `ping` parameter to automatically animate the pin after panning. Useful for navigating to pins from other UI elements (e.g., clicking a note in a journal to pan to its associated pin).
- **Context Menu Ping**: Added "Ping Pin" option to right-click context menu (available to all users) with combo animation (scale-large followed by ripple).
- **Cross-Scene Pin Deletion**: `pins.delete(pinId)` now automatically searches all scenes to find the pin if no `sceneId` is provided. This makes it easy to delete pins from notes/UI without tracking which scene they're on.
- **Find Pin Scene Helper**: Added `pins.findScene(pinId)` method to find which scene contains a specific pin.
- **Pure DOM Pin Rendering**: Refactored pin rendering from hybrid PIXI+HTML approach to pure DOM approach for better layering, styling flexibility, and performance. Pins now render as HTML divs in a fixed overlay container (`#blacksmith-pins-overlay`) with `z-index: 2000`.
- **Pin Shape Support**: Added `shape` property to pin data with support for `'circle'` (default), `'square'` (rounded corners), and `'none'` (icon only, no background). Square pins use configurable border radius via CSS variable.
- **Double-Click Event**: Added `'doubleClick'` event type to pin event system. Double-click detection uses a 300ms window and prevents false clicks/double-clicks during drag operations.
- **Context Menu Registration System**: Added `pins.registerContextMenuItem()` and `pins.unregisterContextMenuItem()` API methods allowing modules to register custom context menu items. Menu items can be filtered by `moduleId` and `visible` function, and sorted by `order` property. Default items (Delete Pin, Properties) are always included.
- **RGBA Color Support**: Pin style properties (`fill`, `stroke`) now support RGBA, HSL, HSLA, and named colors in addition to hex colors. Alpha channel is properly handled.
- **Enhanced Image Support**: Pin `image` property now supports multiple formats:
  - Font Awesome HTML: `<i class="fa-solid fa-star"></i>`
  - Font Awesome class strings: `'fa-solid fa-star'`
  - Image URLs: `'icons/svg/star.svg'` or `'assets/images/portrait.webp'`
  - Image tags: `<img src="path/to/image.webp">`
- **CSS-Based Styling**: All pin styles moved to `styles/pins.css` with CSS variables for configuration:
  - `--blacksmith-pin-icon-size-ratio`: Controls image size within pin (default: 0.90 = 90%)
  - `--blacksmith-pin-square-border-radius`: Controls corner radius for square pins (default: 15%)
- **Fade-In Animations**: Pins now fade in smoothly (0.2s transition) when created or shown after scene load.
- **Performance Optimizations**: Pins hide during canvas pan/zoom operations and update positions after a debounced delay (200ms) to allow canvas to settle, eliminating lag during canvas interactions.

### Changed
- **Pin Rendering Architecture**: Complete refactor from hybrid PIXI+HTML to pure DOM approach. Pins are now HTML divs with CSS styling instead of PIXI.Graphics objects. This improves layering (pins appear above tokens), simplifies styling, and provides better browser compatibility.
- **Event System**: Switched from PIXI event system to DOM event system. All events now use DOM MouseEvent instead of PIXI.FederatedPointerEvent. Event listeners are attached directly to pin DOM elements.
- **Context Menu**: Enhanced context menu system with registration API. Modules can now add custom menu items that appear alongside default items. Menu items are filtered and sorted automatically.
- **Pin Visibility**: Pins now properly load and display on scene activation. Added `_scheduleSceneLoad()` method to ensure pins are loaded after canvas is fully initialized.

### Fixed
- **Ownership Visibility**: Fixed pins to only render for users with view permissions. Pins now respect the `ownership` property and automatically filter based on user permissions during scene load and updates.
- **Ownership Permission Bug**: Fixed `_canView()` to require at least LIMITED (level 1) permission instead of incorrectly allowing NONE (level 0).
- **Pin Positioning**: Fixed icon centering issues by dynamically measuring Font Awesome icon dimensions after rendering instead of assuming square dimensions.
- **Scene Load**: Fixed pins not appearing on scene load until a new pin was added. Pins now load automatically when scenes activate.
- **Pan/Zoom Performance**: Fixed lag during canvas pan/zoom by hiding pins instantly and showing them after canvas settles, with debounced position updates.
- **Visual Glitches**: Fixed pins appearing off-center then snapping into place by ensuring positions are calculated before pins become visible.
- **Image Rendering**: Images now render nicely within pin shapes using `background-size: cover` and circular clipping for proper fill without gaps.
- **Drag Position Persistence**: Fixed pins snapping back to original position after drag by tracking and saving the final dragged position instead of using stale pin data.
- **Subsequent Drag Operations**: Fixed pins jumping away from mouse cursor on second and subsequent drags by fetching fresh pin data at the start of each drag operation instead of using stale closure data.
- **Double-Click Detection**: Fixed double-click events not firing for editable pins by removing a faulty condition that prevented the second click from being registered when a timeout from the first click was still active.
- **Memory Leaks**: Fixed critical memory leaks in pin system:
  - Hook listeners (`canvasPan`, `updateScene`, `canvasReady`) now properly removed on module cleanup
  - Window resize listener now properly removed on module cleanup
  - Pending animation frames now canceled on cleanup
- **Performance Optimizations**: Eliminated PIXI.Point allocations in hot paths by reusing single point instances for coordinate conversion. Pan/zoom operations and drag operations now use zero allocations for coordinate math, reducing garbage collection pressure.
- **"Bring Players Here" Socket Issue**: Fixed "Bring Players Here" context menu option not working. Changed from `socket.emit()` (which routes through generic event system) to `socket.executeForOthers()` (which directly calls SocketLib handlers). Now properly broadcasts pan-to-pin and ping animation to all connected players.
- **Icon/Image Type Change Rendering**: Fixed pins not updating visually when switching between icon and image types (e.g., from Font Awesome icon to `<img>` tag or vice versa). The renderer now automatically detects icon/image type changes during `update()` and rebuilds the icon element when needed, eliminating the need for manual `reload()` calls. Pins now update immediately when changing icon/image types without requiring a page refresh.

### Technical Details
- **Coordinate Conversion**: Pins use `PIXI.Point` and `stage.toGlobal()` for converting scene coordinates to screen pixels, accounting for canvas scale and position. Reuses single point instances to avoid allocations.
- **CSS Variables**: All configurable styling moved to CSS variables in `:root` selector at top of `pins.css` for easy customization.
- **DOM Reflow**: Uses `void element.offsetWidth` to force browser reflow when needed for accurate positioning.
- **Event Cleanup**: All event listeners use AbortController pattern for automatic cleanup on pin removal or module unload. Hook listeners and window listeners properly cleaned up in `cleanup()` method.
- **Socket Integration**: Pin broadcasting uses SocketLib's `executeForOthers()` method directly to match handler registration pattern, ensuring reliable cross-client communication.
- **Icon Type Tracking**: Pin renderer tracks icon type (`'fa'`, `'image'`, or `'none'`) using `dataset.iconType` on the icon element. When `update()` detects a type change, it removes the old icon element and creates a new one to ensure clean state and prevent stale rendering. All icon-related styles are cleared before applying new styles to avoid visual artifacts. 

## [13.2.0] - Pin API Draft Release

### NEW FEATURE
- **Canvas Pins System**: Complete pin system for placing configurable markers on the FoundryVTT canvas. Pins are stored in scene flags, support Font Awesome icons, and provide full CRUD operations with event handling. Designed for use by other Coffee Pub modules (e.g., Coffee Pub Squire).

### Added
- **Pin API Availability Checks**: Added `pins.isAvailable()`, `pins.isReady()`, and `pins.whenReady()` methods to help other modules safely use the pins API. `isAvailable()` checks if Blacksmith is loaded and the API is exposed. `isReady()` checks if the API is available, canvas is ready, and a scene is active. `whenReady()` returns a Promise that resolves when the canvas is ready (useful for modules that need to create pins at `init` or `ready`).
- **Pin API Usage Documentation**: Expanded `api-pins.md` with comprehensive usage patterns, including cross-module integration examples, event handler patterns with `AbortSignal` cleanup, and step-by-step guides for creating pins from other modules. Added examples for `init`/`canvasReady` hooks, handler registration with cleanup, and sync guards before reload operations.
- **Markdown Utilities (Subset)**: Added `markdownToHtml()` and `htmlToMarkdown()` to core utilities for the supported Markdown subset (headings, rules, emphasis, lists, blockquotes) with safe HTML sanitization and a wrapper class for styling.
- **Markdown Utility Documentation**: Documented the supported subset with examples in `documentation/api-core.md`.


## [13.1.1]

### Added
- **Pin Data Model**: UUID-based pin IDs, schema versioning, validation, and migration system. Pins stored in `scene.flags['coffee-pub-blacksmith'].pins[]`.
- **Pin CRUD API**: Full create, read, update, delete, and list operations via `game.modules.get('coffee-pub-blacksmith')?.api?.pins`.
- **Event Handler System**: Register handlers for `hoverIn`, `hoverOut`, `click`, `rightClick`, `middleClick` events with filtering by `pinId`, `moduleId`, `sceneId`. Supports `AbortSignal` for automatic cleanup.
- **Pin Rendering**: Pins render on Blacksmith layer as circles with Font Awesome icons. Hover feedback (scale animation) and visual styling (fill, stroke, size, alpha).
- **Context Menu**: Right-click context menu with Edit, Delete, and Properties options. Permission-aware (respects ownership and `pinsAllowPlayerWrites` setting).
- **Font Awesome Icon Support**: Pins use Font Awesome icons only (e.g., `<i class="fa-solid fa-star"></i>`). Legacy image paths automatically converted to default star icon.
- **Auto-Layer Activation**: Blacksmith layer automatically activates when loading scenes with pins, ensuring pins are visible after refresh.
- **Pin Reload API**: `pinsAPI.reload()` method for manual pin reload from console (useful for debugging).
- **Permission System**: GM-only create/update/delete by default, configurable via `pinsAllowPlayerWrites` world setting. Ownership-based visibility/editability using Foundry's ownership levels.
- **Scene Persistence**: Pins automatically load when scenes activate and persist across scene changes.

### Changed
- **Blacksmith Layer Auto-Activation**: Layer now automatically activates when loading scenes that contain pins, ensuring pins are visible without manual layer activation.

### Fixed
- **Player Toolbar Refresh**: Removed GM-only render guard so player clients refresh toolbars when external modules register tools.
- **Toolbar Hook Error**: Fixed undefined `toolsFromVisibleTools` reference during toolbar rebuild.
- **Icon Loading Errors**: Pins now use Font Awesome only, eliminating 404 errors from legacy SVG image paths. Legacy paths automatically converted to Font Awesome star icon.

### Removed
- **Legacy Broadcast Auto-Close Settings**: Removed deprecated legacy broadcast auto-close settings (`broadcastAutoCloseImages`, `broadcastImageCloseDelaySeconds`, `broadcastAutoCloseJournals`, `broadcastJournalCloseDelaySeconds`) and their migration logic. These have been replaced by `broadcastAutoCloseWindows` and `broadcastAutoCloseDelaySeconds`.

## [13.1.0]

### NEW FEATURE
- **Broadcast Mode**: Added broadcast mode for shared-screen, streaming, and recording FoundryVTT sessions.

### Added
- **Broadcast Window Tools**: Added broadcast tools for closing images, closing journals, closing all windows, refreshing the cameraman client, and opening settings on the cameraman.
- **Broadcast Auto-Close**: Added `broadcastAutoCloseWindows` and `broadcastAutoCloseDelaySeconds` to auto-close cameraman windows after share.
- **Combat Target Framing**: Combat mode now includes targeted tokens in the framing box and updates view when targets change.
- **Broadcast Notification Hiding**: Added `broadcastHideNotifications` setting to hide Foundry pop-up notifications (in `#notifications` container) when in broadcast mode.

### Changed
- **Broadcast View Fill**: Follow, combat, and spectator now use viewport fill percent instead of padding; settings renamed to view fill and legacy padding migration removed.
- **Combat Mode Alignment**: Combat mode now mirrors follow behavior (fixed 3x3 minimum box, turn-start pan, movement follow) with its own view fill.
- **Broadcast Auto-Close Flow**: Cameraman emits `broadcast.windowOpened`; GM starts the auto-close timer and sends close commands.
- **Timer Notification System Simplified**: Removed warning threshold from combat timers - now only uses critical threshold for consistency with planning timers. Unified timer pause/unpause notification settings to control both planning and combat timers.
- **Timer Critical Message Setting**: Renamed `timerChatTurnRunningOut` to `combatTimerCriticalEnabled` for clarity. This setting now controls both notification popups and chat messages for critical threshold warnings in combat timers.
- **Timer Notification Labels**: Updated planning timer labels to use "Critical" terminology instead of "Ending Soon" for consistency.
- **Loading Indicator Stream View Detection**: Loading progress indicator now automatically detects Stream View mode and does not display when Stream View is active (checks for `stream` or `no-ui` classes on document.body).

### Fixed
- **Menubar Enable Setting**: Fixed `enableMenubar` setting not controlling menubar visibility. Menubar now properly initializes only when enabled, removes DOM and resets CSS height variables when disabled, preventing content from being pushed down. Both `excludedUsersMenubar` and `enableMenubar` settings now work correctly together.
- **Broadcast Follow Buttons on Scene Change**: Follow buttons now refresh when scenes change so the list matches current canvas tokens.
- **Duplicate Timer Notifications**: Fixed timer notifications (sounds, chat messages, and notifications) being sent multiple times when crossing threshold. Added flags to ensure each notification type is sent only once per threshold crossing.
- **Duplicate Turn Start Messages**: Fixed duplicate "Turn Started" messages appearing when combat timer resets. Removed duplicate message sending from `resetTimer()` method.
- **Timer Pause/Resume Messages**: Fixed pause and resume messages appearing during automatic timer state changes (e.g., entering planning phase, turn changes). Messages now only appear when GM manually clicks pause/resume buttons.
- **Timer Start Before Initiative Rolled**: Fixed combat turn timers starting and sending messages before all combatants have rolled initiative. Timer now checks that all combatants have rolled initiative before starting, matching planning timer behavior.
- **Combat Timer During Planning Phase**: Fixed combat turn timer starting during planning phase. Timer now correctly checks if planning phase is active (turn 0) and prevents combat timer from starting until planning phase ends.
- **Critical Message Not Showing**: Fixed `combatTimerCriticalEnabled` setting not showing critical messages. Setting now properly controls both notification popups and chat messages regardless of general notification settings.

## [13.0.12]

### Added
- **MVP Tuning Settings (Round + Combat MVP)**:
  - New GM-configurable sliders for MVP scoring weights: Hits, Misses, Crits, Fumbles, Damage (per 10), Healing (per 10)
  - New checkbox to **Normalize MVP scoring by party max** (default: enabled) to reduce "big number" bias and make weights more comparable across party levels/roles
- **Player Manual Rolls Control**: Added `sidebarManualRollsPlayersEnabled` world setting (GM-only) to control whether players can see the manual rolls toggle button in the sidebar. Players must have both `sidebarManualRollsEnabled` (user) and `sidebarManualRollsPlayersEnabled` (world) enabled to see the button.

### Changed
- **MVP Scoring Formula**: MVP scoring is now driven by the new settings (including optional normalization) and is applied consistently for both Round MVP and Combat MVP.
- **Manual Rolls Toggle**: Converted manual rolls toggle to pure client-only operation. Players now toggle their own `core.diceConfiguration` setting directly without requiring socket communication to the GM. GM receives a whisper notification when players toggle manual rolls.
- **Settings Scope Migration**: Migrated 28 user preference settings from `scope: "client"` to `scope: "user"` to ensure user preferences persist across devices. Settings now follow users when they log in from different browsers or devices within the same world. This includes UI preferences (sidebar, toolbar, titlebar, canvas tools, combat tracker display), behavior preferences (auto-roll initiative, clear targets, manual rolls), audio preferences (timer sound volume), and developer preferences (debug mode, console style). Window state settings (combat tracker size, token image replacement window state, chat+combat split) remain `scope: "client"` as they are device-specific.
- **registerHeader Function**: Enhanced `registerHeader` helper function to accept optional `scope` parameter (defaults to `"world"`). All `registerHeader` calls now explicitly specify scope, with user preference sections using `"user"` scope and world-wide configuration sections using `"world"` scope.
- **Hide Default Target Indicators**: Changed `hideDefaultTargetIndicators` setting from `scope: "user"` to `scope: "world"` with default value changed from `false` to `true`. This ensures consistent target indicator behavior across all users in the world.
- **Round Summary Accuracy Display**: Changed accuracy detail in round summary cards to show "X of Y" format (e.g., "3 of 7") instead of "X hits Y misses" for better readability. Misses information remains available in the tooltip.

### Fixed
- **Manual Rolls Toggle for Players**: Fixed critical issue where players could not toggle manual rolls via the sidebar button. The toggle now works immediately for players without requiring them to open Foundry's Dice Configuration settings first. The system now automatically initializes dice configuration with proper dice keys when empty, ensuring toggles work on first use.
- **Manual Rolls Button State**: Fixed button color/active state not updating for players after toggling. Button now correctly reflects the current manual rolls state by re-reading the dice configuration after applying changes.
- **Latency Socket Errors**: Fixed "Unknown message type" errors appearing in player client consoles for latency checker ping/pong messages. Socket handlers now correctly extract payload from nested SocketLib message structures, and the latency checker silently ignores ping/pong messages not intended for the current user (since `executeForOthers` broadcasts to all clients but only the target should process them).

## [13.0.11]

### Added
- **Loading Progress Indicator**: Comprehensive loading progress system for FoundryVTT world loading
  - Full-screen overlay showing overall FoundryVTT loading progress (not just module initialization)
  - Tracks 5 major loading phases: Modules → Systems → Game Data → Canvas → Finalizing
  - Live activity feed displaying current loading activity with spinning icon
  - Activity history showing recent loading activities with fade-out effect
  - Progress bar with percentage display and smooth animations
  - Close button (X) to dismiss indicator and let FoundryVTT continue loading normally
  - Respects `coreLoadingProgress` setting to enable/disable the indicator
  - Background image matching module window style (background-skull-red.webp)
  - Red color scheme matching module theme for progress bar and accents
  - Font Awesome spinner icon for activity indicator
  - Automatic detection of FoundryVTT loading phases via polling
  - Manual activity logging during Blacksmith initialization steps
  - Safe setting check with fallback (defaults to showing if setting unavailable during early init)
- **Chat + Combat Sidebar Tab**: New hybrid sidebar tab combining chat log and combat tracker
  - New tab button appears after the existing Combat button in the sidebar
  - Chat log displayed at top (read-only, no input or controls)
  - Combat tracker displayed at bottom
  - Draggable divider between panes for custom sizing (default 50/50 split)
  - Split ratio persisted per user via client setting (`chatCombatSplit`)
  - Respects `sidebarCombatChatEnabled` setting to show/hide the tab
  - Chat log auto-scrolls to latest messages when content is added
  - Preserves core chat tab functionality by cloning chat log instead of moving it
  - Maintains Foundry's native combat tracker styling by moving entire combat section
- **Healing Tracking System**: Implemented comprehensive healing tracking for player lifetime stats
  - **HP Delta Tracking (Lane 1)**: Source of truth for applied healing - tracks actual HP changes via `preUpdateActor`/`updateActor` hooks
  - **Chat Message Attribution**: Detects healing spells in chat messages using reliable `activity.type === "heal"` signal for caster attribution
  - **MIDI Workflow Support**: Processes healing via `midi-qol.preTargetDamageApplication` hook for accurate per-target healing attribution when using Midi-QOL module
  - **Healing Received**: Tracks `lifetime.healing.received` on target actors when HP increases
  - **Healing Given**: Tracks `lifetime.healing.given` and `lifetime.healing.total` on caster actors
  - **Revive Tracking**: Increments `lifetime.revives.received` when HP goes from 0 to >0
  - **By-Target Tracking**: Maintains `lifetime.healing.byTarget` object with healing amounts per target
  - **Most/Least Healed**: Tracks `mostHealed` and `leastHealed` based on byTarget totals
  - **Human-Readable Logging**: Added detailed console logging for healing data collection (using `postConsoleAndNotification` with "Player Stats | " prefix)
- **Unconscious Tracking System**: Implemented comprehensive unconscious event tracking for player lifetime stats
  - **HP Delta Source of Truth**: Tracks unconscious events when HP drops from >0 to ≤0 via `updateActor` hooks
  - **Queue-Based Attribution**: Stores damage context in per-target queues (last 10 entries) for accurate attribution in multi-hit scenarios
  - **Combat-Aware Matching**: Scores damage contexts by combat round/turn, recency, and damage amount to select best match
  - **Unconscious Log**: Maintains detailed log of unconscious events with date, scene, attacker, weapon, and damage amount
  - **Count Tracking**: Tracks total unconscious count in `lifetime.unconscious.count`
  - **Attribution System**: Captures attacker name, weapon/source name, and damage amount when available from damage messages
- **Refactored Hit/Miss/Damage Tracking**: Complete overhaul of attack and damage resolution system
  - **Message Resolution Pipeline**: New `utility-message-resolution.js` with shared functions for parsing chat messages
  - **Stable Identifiers**: Uses `speaker.actor`, `flags.dnd5e.item.uuid`, `flags.dnd5e.activity.uuid`, and sorted target UUIDs for correlation (replaces unstable `originatingMessage`)
  - **Accurate Hit/Miss Detection**: Determines hit/miss from attack messages using `attackTotal >= target.ac` instead of inferring from damage rolls
  - **Damage Classification**: Classifies damage as "onHit" or "other" based on attack outcome, not damage presence
  - **Attack Cache System**: Implements TTL-based cache (15 seconds) with deduplication for multi-damage workflows
  - **Separate Stats Model**: Records `attacks.hit`, `attacks.miss`, `damage.rolled.onHit`, `damage.rolled.other` separately for accuracy
- **Crit/Fumble Detection Improvements**: Enhanced critical hit and fumble detection
  - **Active Result Detection**: Now uses the active d20 result (for advantage/disadvantage) instead of first result
  - **Multiple d20 Support**: Handles rolls with multiple d20 terms correctly
  - **Debug Logging**: Added diagnostic logging for crit/fumble detection verification
- **Actor Update Queue System**: Implemented per-actor serialization queue to prevent race conditions in stat updates
  - **Sequential Update Guarantee**: Ensures all stat updates for the same actor happen sequentially, not concurrently
  - **Promise-Based Queueing**: Uses promise chaining to serialize writes and prevent concurrent read-modify-write cycles
  - **Automatic Cleanup**: Queue entries are automatically cleaned up when no longer needed
  - **Healing Race Condition Fix**: Prevents healing totals from being overwritten in multi-target healing scenarios (e.g., Mass Cure Wounds)
- **Combat/Round Stats Reliability (Core + Midi-QOL)**: Brought combat/round tracking in line with the multi-lane player-stats architecture
  - **MIDI Lanes**: Use Midi-QOL workflow hooks for authoritative combat events
    - `midi-qol.hitsChecked` for hit/miss resolution
    - `midi-qol.preTargetDamageApplication` for damage + healing (per-target amounts)
    - `midi-qol.RollComplete` for crit/fumble (stamped onto cached attacks)
  - **Core Lane Safety**: Chat-message lane remains as a fallback when Midi-QOL is not authoritative
    - Added `updateChatMessage` handling (rolls/flags-only) so core messages that receive roll data after creation are still processed
  - **Damage/Healing Policy Alignment**:
    - Combat totals now include all damage/healing, including `bucket: "other"` and `"unlinked"` (AoE/save/non-attack and correlation misses)
    - “Top hits / Biggest hit / Weakest hit” moments remain **onHit-only**
  - **Target Attribution Improvements**: Damage processing prefers `damageEvent.targetUuids` when present, with best-effort fallbacks
  - **Combat Summary Totals**: Party-wide totals are computed from **player characters only** (participants may include NPCs for context/moments)

### Changed
- **Healing Detection Logic**: Simplified healing detection to use only reliable `flags.dnd5e.activity.type === "heal"` signal
  - Removed unreliable item name heuristics (checking for "heal", "cure", "restore" in names)
  - Removed `actionType` checks (undefined/unreliable in dnd5e 5.2.4)
  - Per developer review: In dnd5e 5.2.4, healing rolls appear as `roll.type === "damage"` but `activity.type === "heal"` is the reliable indicator
- **API Documentation Console Commands**: Updated all Player Namespace console examples to use `BlacksmithUtils.postConsoleAndNotification` instead of `console.log`
  - All examples now include "Player Stats | " prefix for easy console filtering
  - Consistent with internal codebase logging patterns
  - Properly respects debug flags and notification settings
- **Damage Context Storage**: Upgraded from single-value to queue-based storage for better multi-hit correlation
  - Changed from `Map<actorId, DamageContext>` to `Map<actorId, DamageContext[]>` (queue per target)
  - Stores last 10 damage contexts per target instead of overwriting
  - Includes combat round/turn information for better matching
  - Lazy pruning per target (only removes entries older than 15s for that specific target)
- **Roll Hooks Narrowed**: Roll hooks now only handle crit/fumble detection and metadata
  - `dnd5e.rollAttack`: Only detects crit/fumble, removed hit/miss/damage tracking
  - `dnd5e.rollDamage`: Only forwards to GM for non-GM clients, removed damage tracking
  - All hit/miss/damage resolution moved to `createChatMessage` hook for accuracy
- **Damage Event Hydration**: Enhanced damage event resolution with fallback hydration from chat messages
  - Hydrates missing `attackerActorId` from `message.speaker.actor`
  - Hydrates missing `itemUuid` from `message.flags.dnd5e.item.uuid` (and variants)
  - Hydrates missing `targetUuids` from `message.flags.dnd5e.targets`
  - Provides fallback attacker/item names when resolution fails
  - Ensures context storage always has best available data
- **Sidebar Tab Settings**: Added setting controls for sidebar features
  - `sidebarCombatChatEnabled` setting to enable/disable the Chat + Combat tab
  - `sidebarManualRollsEnabled` setting honored for manual roll button visibility
  - Both settings support dynamic toggling without requiring page reload

### Fixed
- **Healing Message Detection**: Fixed healing messages being incorrectly skipped as "Unlinked Damage"
  - Healing spells now properly detected using `activity.type === "heal"` before skipping unlinked damage
  - Caster's lifetime stats now update when healing spells are cast
  - Target's lifetime stats update via HP delta tracking when healing is applied
- **Healing Stats Not Updating**: Fixed issue where caster's `healing.total` and `healing.given` were not being updated
  - Added `_recordRolledHealing` method to track healing given for casters
  - Healing detection now properly processes healing messages instead of skipping them
- **Inaccurate Hit/Miss Tracking**: Fixed critical bug where all attacks appeared as hits when using midi-qol
  - Root cause: System was inferring "hit = damage rolled", which breaks when midi rolls damage on misses
  - Solution: Now determines hit/miss from attack message (`attackTotal >= target.ac`) before damage is rolled
  - Correctly handles midi-qol "damage on miss" scenarios by classifying as "damage.rolled.other"
- **Unstable Message Correlation**: Fixed damage attribution failures due to unstable `originatingMessage` in dnd5e 5.2.4
  - Replaced `originatingMessage` correlation with stable identifier key (attacker + item + activity + sorted targets)
  - Attack and damage messages now correlate reliably even when `originatingMessage` differs
- **Unconscious Attribution**: Fixed unconscious events showing "Unknown Attacker" and "Unknown Source"
  - Implemented queue-based context storage to handle multiple hits on same target
  - Added combat round/turn matching for better attribution in multi-hit scenarios
  - Increased TTL window from 5s to 15s to account for delays between damage messages and HP updates
  - Enhanced damage event hydration to extract attacker/item/targets from chat message when resolver misses fields
  - Context selection now scores candidates by combat match, recency, and damage amount instead of "last write wins"
- **Crit/Fumble Detection**: Fixed crit/fumble detection failing on advantage/disadvantage rolls
  - Now uses the active d20 result (marked `active: true`) instead of first result
  - Handles multiple d20 terms correctly (e.g., advantage rolls with two d20s)
  - Falls back to first result if no active result is found
- **Healing Race Condition**: Fixed critical race condition where multi-target healing spells (e.g., Mass Cure Wounds) were overwriting healing totals instead of accumulating them
  - Root cause: Multiple concurrent `preTargetDamageApplication` hooks firing simultaneously for the same healer, causing read-modify-write cycles to see stale values
  - Solution: Implemented per-actor update queue system that serializes all stat writes for the same actor
  - Healing totals now correctly accumulate: `0 → 30 → 60 → 90` instead of `0 → 30` (overwritten)
  - Applied to both MIDI healing (`_onMidiPreTargetDamageApplication`) and core healing (`_onChatMessage`) paths
  - Prevents similar race conditions in damage tracking and other concurrent stat updates
- **Combat Summary Totals & Field Mapping**: Fixed combat-end summary totals being incorrect
  - Party totals now aggregate **PCs only** (instead of PCs + NPCs)
  - Corrected mapping so `damageTaken` and `healingGiven` reflect actual tracked values

## [13.0.10]

### Added
- **Combat Start Announcement Card**: Added combat start announcement card that posts when combat is created. Card respects `announceCombatStart` setting and plays `combatStartSound` if configured. Uses dedicated `card-stats-combat-start.hbs` template with green announcement theme.
- **Combat End Announcement Card**: Added "End of Combat" card that appears first in combat summary cards. Card respects `announceCombatEnd` setting and plays `combatEndSound` if configured. Uses dedicated `card-stats-combat-end.hbs` template matching other announcement card styling.
- **Round Start Card**: Renamed `card-stats-round-end.hbs` to `card-stats-round-start.hbs` and updated text to "Round X Begins". Now used for round announcements instead of the section in `cards-common.hbs`.

### Changed
- **Menubar Party Tool Visibility**: Changed party tool visibility to be GM-only instead of leader-only. The tool is now only visible to Game Masters, matching the behavior of other party management tools. This change ensures that non-GM users cannot access party management tools, reinforcing the GM-only nature of these tools.
- **Round and Combat Card Sending**: Updated round and combat stat cards to be sent simultaneously using `Promise.all()` instead of sequentially. This prevents other modules' messages (like movement change or round change cards) from being inserted between stat cards, ensuring all related cards appear together in chat.
- **Round Announcement Template**: Moved round announcement from `cards-common.hbs` to dedicated `card-stats-round-start.hbs` template for better modularity and consistency with other announcement cards.

### Fixed
- **Round Number Calculation**: Fixed round number in round end cards to use the `roundNumber` parameter (the round that just ended) instead of `game.combat.round` (which is already the new round). Round end cards now correctly display the round that just completed.
- **Partial Round Stats on Combat End**: Fixed issue where combat ending mid-round would lose all data from that partial round. The system now detects when combat ends with active round data and processes it like a normal round end (calculates MVP, creates round summary, adds to rounds array) before generating the combat summary. All hits, misses, damage, and other stats from the partial round are now properly captured and included in combat statistics.
- **Combat End Null Reference Error**: Fixed `TypeError: Cannot read properties of null (reading 'turns')` error when combat is deleted. Updated `_onRoundEnd()` and `_prepareTemplateData()` to accept optional combat parameter, allowing them to work with combat objects even when `game.combat` is null during combat deletion. This ensures partial rounds are processed correctly when combat ends mid-round.
- **Token Movement Permission Errors**: Fixed permission errors when players create combat. Added try-catch blocks around setting updates in `createCombat` and `deleteCombat` hooks to gracefully handle permission errors for non-GM clients, preventing error messages from appearing when combat is created or deleted.


## [13.0.9]

### Added
- **Menubar Button Color Customization**: Added `buttonNormalTint` and `buttonSelectedTint` parameters to `registerMenubarTool()` for custom button background colors. Both parameters accept any valid CSS color format (hex, rgba, named colors, HSL, etc.), providing maximum flexibility for tool styling. The normal tint applies to default button state, while the selected tint applies when toggleable tools are active.
- **Menubar Grouping System Documentation**: Added comprehensive documentation for the tiered grouping system, including organization hierarchy (Zone -> Group -> Module -> Order), Blacksmith-defined groups (combat, utility, party, general), group priority rules, and dynamic group creation. Updated all examples to demonstrate best practices with explicit parameter setting.

### Changed
- **Combat Stats Card Structure**: Reverted combat stats cards to simple div-based structure using `<div class="card-header">` and `<div class="section-content">` for consistent styling across all coffee pub cards. Removed Foundry collapsible system integration as it was designed for internal sections, not whole cards.
- **Menubar API Documentation**: Updated API documentation to reflect current implementation with all new parameters (`group`, `groupOrder`, `buttonNormalTint`, `buttonSelectedTint`). Enhanced "Register a Tool" getting started example with complete parameter list following best practices. Updated `getMenubarToolsByZone()` return structure documentation to accurately reflect grouped organization (zone -> group -> module array -> tools). All examples now explicitly show all optional parameters for clarity and maintainability.

### Fixed
- **Menubar Button Tint CSS**: Fixed CSS to properly use custom `--button-normal-tint` and `--button-selected-tint` CSS variables for button background colors. Updated `.blacksmith-menubar-middle .button-active` to use `var(--button-normal-tint, ...)` with fallback to default colors. Updated `.blacksmith-menubar-middle .button-active.tool-active` to use `var(--button-selected-tint, ...)` for active/selected state. Both variables are now properly set in the template's style attribute and applied by CSS with appropriate fallbacks.
- **Menubar Template CSS Variables**: Fixed template to set both `--button-normal-tint` and `--button-selected-tint` as CSS variables in the style attribute instead of data attributes, ensuring they work correctly with CSS fallback values.

### Removed
- **Combat Stats Collapsible Functionality**: Removed all collapsible/expand functionality from combat stats cards. Removed `_registerCollapsibleStateTracking()` method, `sectionStates` static property, and `combatStatsCardStates` client setting. Cards now use the standard non-collapsible card template structure.

### Fixed
- **Auto-Distribute XP Functionality**: Fixed `autoDistributeXp` setting to properly bypass the XP distribution window and automatically distribute XP when enabled. When the setting is enabled, the system now automatically distributes XP based on default values (all players included, no adjustments) without showing the distribution window, effectively mimicking clicking the distribute button without any changes. The implementation uses the same calculation and distribution logic as the manual window, ensuring consistent behavior.
- **Query Window Toolbar Buttons**: Fixed "Send to Chat" and "Copy to Clipboard" toolbar buttons in the query window not finding message content. The issue was caused by attempting to scope queries to the window element after v13 migration, which failed when multiple query windows were open or when viewing recent queries. Simplified the implementation to use `document.querySelector` with `data-message-id` attribute selectors, which works reliably since each message has a unique messageId. Updated all three toolbar button handlers (`_onSendToChat`, `_onCopyToClipboard`, `_onSendToJson`) to use the simplified approach with proper button parameter handling.
- **Toolbar Button Double Events**: Fixed external module toolbar buttons generating duplicate events (2 chat cards) when a tool was registered for both CoffeePub and Foundry toolbars. The issue was caused by both `_wireToolClicks` and `_wireFoundryToolClicks` attaching handlers to the same buttons regardless of which toolbar was active. Added active control checks to each function so `_wireToolClicks` only wires handlers when the CoffeePub toolbar (`blacksmith-utilities` control) is active, and `_wireFoundryToolClicks` only wires handlers when the Foundry toolbar (`tokens` control) is active. This prevents double-wiring when tools appear in both toolbars, ensuring each button click generates only one event.
- **Combat Stats Round Number**: Fixed round number in combat stats cards to use the actual round number from `game.combat.round` instead of maintaining our own counter. Cards now correctly display the current combat round matching the Encounter Tracker.
- **Multiple Combat Timers on Creation**: Fixed issue where multiple combat timers were being created when combat was first created. The timer logic now only processes when `combat.started === true`, preventing timers from starting during combat creation when `updateCombat` hooks fire multiple times (e.g., when adding combatants). Timers will only start when combat is actually started (when "Start Combat" is pressed), not during the creation phase.
- **Combat Tracker Health Ring Visibility**: Fixed combat tracker health ring display for players. Players now see health rings for other players (player-owned actors) showing actual health status, while NPCs display a solid decorative ring (rgba(247, 243, 232, 0.3)) when the `combatTrackerHideHealthBars` setting is enabled. GMs continue to see health rings for all combatants (unless NPC health is hidden). This ensures visual consistency in the combat tracker while respecting privacy settings for NPC health information.

## [13.0.8]

### Fixed
- **External Module Tools Not Appearing**: Fixed external module tools (e.g., bibliosoph) not appearing in the CoffeePub toolbar. The issue was caused by:
  - `onCoffeePub` property filtering not properly handling function values - added `isOnCoffeePub()` helper to evaluate both boolean and function values
  - Missing `name` property defaults for external tools - now defaults to `toolId` if not provided
  - Missing `button`, `title`, and `icon` property defaults - now provides sensible defaults for v13 compatibility
- **Foundry Toolbar Labels and Formatting Missing**: Fixed zone labels, dividers, and formatting not appearing on the core Foundry toolbar (tokens control). Updated `_applyZoneClasses()` to handle both CoffeePub toolbar (`blacksmith-utilities` control) and Foundry toolbar (`tokens` control) by checking the active control and applying zone classes accordingly.
- **Foundry Toolbar Zone Organization**: Fixed tools appearing in wrong zones between CoffeePub toolbar and Foundry toolbar. Updated `getFoundryToolbarTools()` to organize tools by zone and sort by order (matching `getVisibleToolsByZones()` logic), ensuring consistent zone grouping across both toolbars.
- **Foundry Toolbar Timing Issue**: Fixed Blacksmith's own buttons (request roll, replace image) not showing up in the core Foundry toolbar when using `onFoundry()` functions that read settings. Changed `onFoundry` implementations to use `getSettingSafely()` helper instead of manually checking setting availability, preventing tools from being filtered out before settings are registered.
- **General Zone CSS Styling**: Fixed "general" zone tools not receiving proper styling. Added fallback CSS selectors that don't require the `tool` class, ensuring zone classes apply correctly even when buttons don't have the expected class structure.
- **SceneControls Rendering Lifecycle (v13)**: Fixed toolbar tools not persisting after registration by correctly implementing FoundryVTT v13's SceneControls rendering lifecycle:
  - Replaced manual `controls` object manipulation with `ui.controls.render({ reset: true })` to trigger Foundry's internal rebuild pipeline
  - Removed problematic `ui.controls.controls = controls` assignment (read-only getter in v13)
  - Added debounced `requestControlsRender()` to prevent render loops
- **Early Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tokens')` and similar errors during early initialization by:
  - Adding `safeActiveToolName()` and `safeActiveControlName()` helper functions that wrap `ui.controls` access in try-catch blocks
  - Replacing all direct `ui.controls.control?.name` and `ui.controls.tool?.name` accesses with safe helpers
  - Removing `game.activeTool` and `game.activeControl` references that don't exist in v13
- **ReferenceError: activeTool is not defined**: Fixed `activeTool` variable not being declared in `getSceneControlButtons` hook callback scope.
- **Excessive Debug Logging**: Removed all debug logging related to toolbar state, tool registration, and DOM manipulation that was added during troubleshooting.

### Changed
- **Request Roll Tool Organization**: Moved "Request a Roll" tool from "rolls" zone to "gmtools" zone to better reflect its GM-only nature.
- **Request Roll Toolbar Visibility**: Changed request roll tool from hardcoded `onFoundry: true` to read from `requestRollShowInFoundryToolbar` setting, allowing users to control Foundry toolbar visibility independently.
- **Toolbar Display Settings**: Replaced two separate boolean settings (`toolbarShowDividers` and `toolbarShowLabels`) with a single dropdown setting (`toolbarDisplayStyle`) with three options:
  - "Foundry Default" (no organization)
  - "Category Dividers" (visual separators)
  - "Category Labels" (text labels)
  - Default is "Category Labels"
  - Prevents users from enabling both dividers and labels simultaneously
- **Request Roll Menubar Visibility**: Added `requestRollShowInMenubar` setting to control request roll tool visibility in the menubar, allowing independent control from toolbar visibility.

### Added
- **Request Roll Toolbar Settings**: Added two new settings for controlling request roll tool visibility:
  - `requestRollShowInFoundryToolbar` - Control visibility in Foundry toolbar (default: false)
  - `requestRollShowInMenubar` - Control visibility in menubar (default: true)
- **Toolbar Display Style Setting**: Added `toolbarDisplayStyle` dropdown setting to replace the previous two boolean settings, providing a cleaner interface for toolbar organization preferences.

## [13.0.7]

### Added
- **Portrait Replacement Filtering Options**: Added the same filtering options for portrait image replacement that were previously available for token replacement. Portrait replacement now supports independent toggles for:
  - Update Monsters (`portraitImageReplacementUpdateMonsters`)
  - Update NPCs (`portraitImageReplacementUpdateNPCs`)
  - Update Vehicles (`portraitImageReplacementUpdateVehicles`)
  - Update Actors (`portraitImageReplacementUpdateActors`)
  - Skip Linked Tokens (`portraitImageReplacementSkipLinked`)
  These settings allow fine-grained control over which actor types have their portraits automatically replaced, matching the functionality available for token image replacement.
- **Card Theme System Documentation**: Added `migration-cards.md` documentation outlining the migration plan for converting hardcoded colors in card-specific CSS files to use the new CSS variable theme system.
- **Folder Progress Display**: Added folder number display to scan progress messages. Progress now shows "Folder X of Y | Phase X of Y" when scanning multiple image folders, indicating which configured folder is currently being processed.

### Changed
- **Token and Portrait Replacement Filtering**: Enhanced both token and portrait image replacement processing to respect actor type and linked token settings. Both systems now check actor type (monster, NPC, vehicle, character) and linked token status before processing replacements, ensuring consistent behavior across both replacement modes. Added `_shouldUpdateActor()` helper function that centralizes the filtering logic for both token and portrait replacement.
- **Card CSS Architecture Refactoring**: Refactored card CSS system to use CSS variables for complete themeability. Separated layout and theme concerns:
  - `cards-common-layout.css` - Contains all layout, spacing, typography, and structure (uses CSS variables)
  - `cards-common-themes.css` - Contains only color definitions via CSS variables
  - All CSS variables are namespaced with `blacksmith-card-` prefix to avoid conflicts with other modules
  - Default variable values defined in `:root {}` for proper CSS inheritance
  - Theme classes only override CSS variable values, never layout properties
  - Used attribute selector `[class*="theme-"]` for theme-specific layout adjustments to automatically support new themes
- **XP Card Theme Migration**: Migrated XP distribution chat cards to use the `blacksmith-card` theme system, matching the structure used by skill check cards. Cards now use `.card-header` and `.section-content` classes from the theme system for consistent styling.
- **Card CSS Namespacing**: All card-related CSS classes are now properly namespaced with `.blacksmith-card` prefix to avoid conflicts with other modules. Section headers, content areas, and all card components are scoped to `.blacksmith-card` selectors.
- **Root Folder Categorization**: Improved categorization logic for files located directly in the root of image directories. Files in the root are now categorized by the root folder name instead of appearing under "all". If a root directory contains only files (no subfolders), the root directory name is used as the category. If a root directory contains both files and subfolders, root files use the root directory name as their category while subfolder files behave normally.

### Fixed
- **Incremental Update Performance**: Fixed incremental updates being significantly slower than full scans by removing artificial delays during incremental update operations. Incremental updates now skip delays that were intended for UI visibility during full scans, making them faster than full rescans.
- **Incremental Update Accuracy**: Fixed incremental update system to properly detect and remove deleted files and renamed folders. The system now correctly identifies files that no longer exist in the file system and removes them from the cache, preventing empty categories from appearing.
- **Empty Folder Cleanup**: Fixed orphaned folder entries remaining in categories after files are deleted. Added cleanup logic that runs after all incremental updates complete to remove empty or invalid folder entries from the cache.
- **Category Button Updates**: Fixed category buttons not updating correctly after incremental scans. Categories now properly reflect the current state of the file system, with deleted folders removed and new categories added as needed.
- **System File Scanning**: Fixed system files (desktop.ini, thumbs.db, .DS_Store, folder.jpg, folder.png, .gitignore, .gitkeep) being scanned and displayed in progress messages. System files are now filtered out early in the scanning process before being displayed or processed.
- **Incremental Update Errors**: Fixed `newFileCount is not defined` error in incremental update completion messages by using the correct `finalFileCount` variable.
- **Folder Cache Type Errors**: Fixed `cache.folders.get(...).push is not a function` errors by adding defensive checks to ensure folder entries are always arrays before calling array methods.

## [13.0.6]

### Added
- **Image Replacement Variability**: Added variability feature for both token and portrait image replacement. When enabled, the system randomly selects from all images with the highest matching score instead of always using the same top match. This adds visual variety when multiple tokens or actors of the same type are created. Variability is enabled by default for both tokens and portraits, with separate settings (`tokenImageReplacementVariability` and `portraitImageReplacementVariability`) that can be toggled independently. The feature respects the existing matching threshold setting, only considering matches above the threshold.
- **Portrait Image Replacement Update Dropped**: Added portrait-specific "Update Dropped Portraits" toggle that works independently from token image replacement. When enabled, actor portraits are automatically updated with the best matching portrait when tokens are created on the canvas. This complements the existing token image replacement feature, allowing both token images and actor portraits to be updated automatically when tokens are dropped.

### Changed
- **Image Replacement Global Controls Layout**: Restructured the global controls header in the image replacement window. The Token/Portrait mode toggle is now left-aligned with "Tokens" label on the left and "Portraits" label on the right of the toggle for clarity. Other global controls (Loot Piles, Convert Dead) are right-aligned. Added CSS styling for the new layout structure.
- **Image Replacement Match Display**: Updated matching logic so that match percentages are always displayed when a token or actor is selected, regardless of which filter button is active (ALL, category buttons, SELECTED). Previously, match percentages only appeared on the SELECTED tab. This ensures consistent visual feedback across all filter modes.
- **Cinematic Roll Button Visual Feedback**: Added color-coded background styling for advantage/disadvantage modifier buttons in cinematic roll window. Disadvantage buttons now have a red tint (`rgba(148, 9, 9, 0.5)`) and advantage buttons have a green tint (`rgba(22, 77, 11, 0.5)`) to provide clear visual distinction between roll types.
- **Skill Check Card Theme Migration**: Migrated skill check chat cards to use the `blacksmith-card` theme system for consistent styling and v13 compatibility. Cards now leverage the standard `.card-header` styling from the theme instead of custom header styles.
- **Card CSS Organization**: Moved all skill check card-related CSS from `window-skillcheck.css` to dedicated `cards-skill-check.css` file for better modularity and maintainability.
- **Template Naming**: Renamed skill check card template from `skill-check-card.hbs` to `card-skill-check.hbs` to match naming conventions with other card templates.

### Fixed
- **Cinematic Window Circular Buttons**: Fixed circular buttons (dice roll buttons and close button) in the cinematic roll window appearing elliptical/horizontally compressed after v13 migration. Added `box-sizing: border-box`, `min-width`, `min-height`, and `aspect-ratio: 1` to ensure buttons maintain perfect circular shape. Buttons now display correctly as circles regardless of flex container constraints.
- **Cinematic Button Icon Alignment**: Fixed icon misalignment in cinematic roll buttons caused by unnecessary `padding-left: 3px` on icons. Removed padding since flexbox centering (`justify-content: center` and `align-items: center`) already properly centers icons. Added explicit `padding: 0` and `margin: 0` to roll area container to prevent any default spacing issues.
- **Unused Code Cleanup**: Removed unused `getResultSound()` function from `window-skillcheck.js` that was never called. Sound logic is handled directly in `deliverRollResults()` and `updateCinemaOverlay()` functions.
- **Long Name Ellipsis**: Fixed ellipsis for long actor names in roll buttons, ensuring names truncate properly with ellipsis in both pre-roll (pending roll buttons) and post-roll (completed roll results) states. Added proper flex container constraints and `min-width: 0` to all parent containers to allow proper text overflow handling.

## [13.0.5]

### Fixed
- **Journal Tools querySelector Error**: Fixed `TypeError: nativeElement.querySelector is not a function` in Journal Tools window. Updated `_getNativeElement()` method to include jQuery detection and validation, ensuring it returns a valid native DOM element with `querySelector` method before use. Matches the pattern used in other windows for v13 compatibility.
- **SceneControls Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tools')` errors from third-party modules (tile-sort, monks-wall-enhancement, walledtemplates, multi-token-edit) when `refreshSceneControls()` was called before controls were fully initialized. Added validation checks to ensure controls object exists, is populated, and `ui.controls` has been rendered before calling `getSceneControlButtons` hook. Additionally restricted `refreshSceneControls()` to only run for GMs since players don't have access to scene controls, preventing 96+ errors for players when other modules try to access controls that don't exist for them.
- **Menubar Health Tooltip Privacy**: Fixed menubar combat portrait tooltips showing HP information when health rings are hidden. Tooltips now conditionally exclude HP information when `menubarCombatHideHealthBars` is enabled for non-GM users, matching the health ring visibility behavior. GMs always see full tooltip information regardless of the setting.
- **Menubar Token Panning Visibility**: Fixed menubar combat portrait clicks panning to tokens that players cannot see. Panning now checks token visibility for non-GM users, including hidden status, canvas visibility, and user visibility (vision/walls). Players can only pan to tokens they can actually see on the canvas. GMs can always pan to any token. Fixed token highlight method to use `setHighlight()`/`clearHighlight()` instead of deprecated `highlight()` method.
- **Combat Tracker and Menubar Hidden Token Visibility**: Fixed hidden tokens and hidden combatants not being properly handled in both combat tracker and menubar. Hidden combatants (via `combatant.hidden` or `token.hidden`) now immediately disappear from players' view in both locations, matching the combat tracker's native behavior. GMs always see all combatants with visual indicators: `hide` class in combat tracker and `combat-token-hidden` class in menubar for styling purposes. When a token is hidden on the canvas, it is also hidden in the combat tracker for players, ensuring consistent visibility rules across all combat interfaces.
- **Effects Panel Menubar Overlap**: Fixed effects panel overlapping with the menubar when present. The effects panel now shifts down by the menubar height using `calc(5px + var(--blacksmith-menubar-interface-offset))` to preserve its original 5px top offset while accounting for the fixed menubar, matching the behavior of other UI elements like chat.
- **Clarity Mode GM-only Brightness**: Reworked clarity brightness to be GM-local only using a PIXI color-matrix filter on the client; no `scene.update` calls so players are unaffected. Restores cleanly on deactivate and across scene changes.
- **Clarity Mode Vision Override**: While clarity is active, GM disables token-only vision (`canvas.sight.tokenVision = false`) to keep the whole scene visible even with a selected token; restores the original setting on deactivate. Fog transparency remains a client-only 10% alpha tweak for the GM.
- **Clarity Token Overlays**: Updated hatch overlay asset (overlay-pattern-04) and ensured overlays reapply on token control without affecting players.

## [13.0.4]

### Fixed
- **Combat Tracker Health Ring Alignment**: Fixed health rings misaligning with portraits when combatant names wrap to multiple lines. The ring container now takes the full height of the combatant and centers the ring vertically using CSS-only solution, eliminating the need for JavaScript positioning calculations and ResizeObserver.
- **SceneControls Deprecation Warning**: Replaced deprecated `SceneControls.initialize()` calls with v13+ `render({controls, tool})` API. Created `refreshSceneControls()` helper function that rebuilds controls via `getSceneControlButtons` hook and renders with the updated controls, preserving active tool state. This eliminates deprecation warnings and ensures compatibility with Foundry v15.
- **Combat Tracker NPC Health Ring Visibility**: Fixed NPC health rings being visible to players in the combat tracker. Health rings for NPCs are now hidden from non-GM users when the `combatTrackerHideHealthBars` setting is enabled, matching the menubar behavior. GMs always see health rings for all combatants regardless of the setting.

## [13.0.3] - Sockets

### Fixed
- **Journal Double-Click Image Editing**: Simplified image double-click handler in edit mode to directly click the image toolbar button instead of attempting to access Prosemirror internals. This provides a more reliable and maintainable solution that works consistently.
- **Encounter Toolbar Page Navigation**: Fixed encounter toolbar disappearing when switching between journal pages. The toolbar now correctly detects page navigation, finds the active page (not just any page), cleans up old toolbars from previous pages, and processes toolbar updates even when app window lookup fails. Increased delays to ensure active page class has settled before processing.
- **Socket API Timing Issues**: Fixed race condition where `module.api.sockets` was set asynchronously after `module.api` was created, causing external modules to fail when accessing the socket API. Added polling mechanism in `BlacksmithAPI.getSockets()` to wait up to 2 seconds for socket API initialization.
- **Socket API SocketLib Compatibility**: Fixed socket API to properly work with SocketLib sockets, which use `executeForOthers()` pattern instead of `emit()`. Added wrapper that translates `emit()` calls to SocketLib's execution pattern for external modules while maintaining backward compatibility with internal Blacksmith code.
- **Socket API Native Fallback**: Fixed native socket fallback to include `emit()` method, ensuring the socket API works whether SocketLib is available or not. Native fallback now properly implements the full socket interface.
- **Socket API Global Access**: Added `window.Blacksmith.socket` global alias for backward compatibility with documented access patterns.

### Changed
- **Socket API Logging**: Reduced verbose logging for socket event registration to only log on first registration per event name to reduce console spam.

### Added
- **Socket API Documentation**: Updated `api-sockets.md` with multiple access patterns and timing-aware initialization examples to help external modules properly use the socket API, including proper handling of asynchronous socket initialization.

## [13.0.2] - v13 Migration

### Fixed
- **Toolbar - External Module Tool Registration:** Fixed external modules' tools not appearing in CoffeePub toolbar
  - Added automatic toolbar refresh when tools are registered via `registerToolbarTool()` API
  - Tools now appear immediately after registration without requiring manual refresh
  - Added debug logging to help diagnose tool registration issues
- **Toolbar - v13 SceneControl Structure:** Fixed `TypeError: Cannot read properties of undefined (reading 'onChange')` when switching toolbars
  - Updated control structure to match v13 `SceneControl` interface requirements
  - Added required `activeTool` property (must point to valid tool key)
  - Added required `onChange` and `onToolChange` handlers on control
  - Added required `order` and `visible` properties
  - Changed from deleting/recreating control to updating in place to preserve Foundry's tool references
  - Merged tools instead of replacing entire tools object to prevent reference loss
- **Toolbar - Auto-Activation of Tools:** Fixed tools auto-triggering when control opens (e.g., "Request a Roll" dialog opening automatically)
  - Removed `onClick` from `SceneControlTool` objects (v13 compatibility shim auto-calls it from `onChange`)
  - Changed `onChange` handlers to no-ops that never call `tool.onClick`
  - Implemented `_wireToolClicks()` to attach real DOM click handlers directly to rendered buttons
  - Tool buttons now respond only to actual user clicks, not control activation
  - Prevents v13 compatibility shim from auto-calling `onClick` on control activation
- **Toolbar - Tool Button Clicks:** Fixed tool buttons not responding to clicks in CoffeePub toolbar
  - Implemented direct DOM event handlers via `_wireToolClicks()` function
  - Handlers attached to rendered `<button data-tool="...">` elements after toolbar renders
  - Works correctly even when clicks occur on tooltip elements (ASIDE)
  - Handlers prevent default behavior and stop propagation to avoid conflicts with Foundry's toggle logic
- **Toolbar - Tool Updates:** Fixed tool updates not preserving Foundry's internal references
  - Changed from replacing entire tools object to merging tools in place
  - Preserves active tool references when updating control
  - Explicitly removes `onClick` from updated tools to prevent shim issues
- **Settings UI - v13 CSS Selectors:** Fixed settings styling not applying due to v13 DOM structure changes
  - Replaced `data-setting-id` attribute selectors (removed in v13) with `:has()` selectors targeting `label[for]` attributes
  - Updated all selectors from `div[data-setting-id*="coffee-pub-"]` to `.form-group:has(label[for*="settings-config-coffee-pub-"])`
  - Changed `.notes` class references to `.hint` (v13 renamed the class)
  - Added missing color declarations for light mode (labels, hints) that were previously inherited from Foundry defaults
  - Settings now properly styled in v13's new HTML structure
- **Settings UI - Dark Mode Support:** Fixed dark mode styles not applying
  - Changed dark mode selectors from `html.theme-dark` to `[data-theme="dark"]` to match Foundry v13's theme attribute on `<body>`
  - Added comprehensive dark mode color overrides for all heading levels (H1, H2, H3, H4) and general settings
  - Dark mode now properly detects and applies theme-specific colors for backgrounds, text, and borders
  - Settings UI now fully supports both light and dark themes

### Changed
- **Toolbar API - Tool Registration:** Enhanced `registerToolbarTool()` to automatically refresh toolbar
  - Toolbar now refreshes automatically after tool registration
  - Re-triggers `getSceneControlButtons` hook to rebuild toolbar with new tools
  - Added debug logging for tool registration status
- **Toolbar - v13 Migration:** Migrated toolbar to v13 `SceneControl` interface
  - Tools use `onChange` as no-ops (v13 requirement) but never call `tool.onClick`
  - Real click handling done via direct DOM event handlers in `_wireToolClicks()`
  - Control structure matches v13 requirements exactly
  - All tools have proper `onChange` handlers (no-op for button tools)
- **Settings UI - v13 CSS Migration:** Migrated settings CSS to v13 HTML structure
  - Replaced deprecated `data-setting-id` attribute targeting with `:has()` pseudo-class selectors
  - Updated class names from `.notes` to `.hint` to match v13 naming
  - Added explicit color declarations for all text elements (previously relied on Foundry defaults)
  - Implemented dark mode support using `[data-theme="dark"]` attribute selector
  - All heading types (H1, H2, H3, H4, HR, SP) now have proper light and dark mode styling

### Technical
- **Toolbar - v13 Compatibility:** Addressed v13 compatibility shim behavior
  - v13 automatically calls `onClick` from inside `onChange` when tool is activated
  - Solution: Don't define `onClick` on `SceneControlTool`, make `onChange` a no-op, and wire real DOM click handlers
  - `_wireToolClicks()` attaches event listeners directly to rendered buttons, bypassing v13's shim entirely
  - This approach completely avoids auto-activation issues and provides reliable click handling
- **Toolbar - Reference Preservation:** Improved tool reference handling
  - Update tools in place using `Object.assign` to preserve Foundry's internal references
  - Merge tools instead of replacing entire object
  - Preserve active tools when they're being removed (mark as invisible instead of deleting)
- **Settings UI - v13 Theme Detection:** Updated theme detection mechanism
  - Foundry v13 uses `data-theme="dark"` attribute on `<body>` element instead of `html.theme-dark` class
  - Changed all dark mode selectors from `html.theme-dark` to `[data-theme="dark"]`
  - Theme detection now correctly matches Foundry's v13 implementation
  - Why: v13 changed from class-based theme detection to data attribute-based detection for better flexibility



## [13.0.1] - v13 Migration

### Fixed
- **Combat Tracker - Health Ring Alignment:** Fixed health rings not aligning correctly over token/portrait images in the combat tracker
  - Updated CSS positioning for `.health-ring-container` and SVG elements
  - Changed insertion logic to insert health ring container right before token image element
- **Combat Tracker - Roll Remaining Button:** Fixed "Roll Remaining" button not appearing in combat tracker
  - Migrated button creation to native DOM methods (removed jQuery dependency)
  - Updated button structure to match v13 format with `data-action` attribute
  - Improved insertion logic with multiple search roots for better compatibility
  - Fixed event listener removal to use native `removeEventListener` instead of jQuery
  - Increased hook priority to ensure button appears after other combat tracker elements
- **Combat Tracker - Planning Timer:** Fixed multiple planning timer issues
  - Fixed timer not being visible or clickable
  - Fixed timer showing "0s Planning" when active (state initialization issue)
  - Fixed timer not gracefully disappearing after planning ended
  - Fixed excessive re-renders by adding initiative check before showing timer
  - Fixed timer appearing before all initiatives were rolled
  - Changed HTML structure from `.combatant.planning-phase` to `.planning-timer-item` to avoid CSS conflicts
  - Updated CSS to force visibility with important flags
  - Enhanced fade-out to work in both sidebar and popout windows
  - Fixed setting access errors by using `getSettingSafely` utility
- **Combat Tracker - Combat Timer:** Fixed combat timer visibility and timing issues
  - Fixed timer not showing in popped-out combat window
  - Fixed timer not being clickable
  - Fixed timer showing before all initiatives were rolled
  - Updated selectors from `#combat-tracker` to `.combat-tracker` for v13 compatibility
  - Enhanced `updateUI()` to find timer elements in both sidebar and popout windows
- **Combat Tracker - Popout Window Closing:** Fixed popped-out combat window not closing when combat ends
  - Enhanced `closeCombatTracker()` to check multiple ways to find and close popout window
  - Added direct DOM lookup for `#combat-popout` element
  - Added fallback to click close button if Application instance not found
  - Made `endCombat` hook callback async to properly await window closing
- **XP Distribution Window:** Fixed jQuery-related errors in XP distribution window
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelector is not a function` errors in multiple methods
  - Added jQuery detection and conversion for all DOM queries
  - Updated `_updateXpDisplay()`, `_getIncludedPlayerCount()`, `_updateXpDataPlayers()`, `_onModeToggleChange()`, and `_collectMilestoneData()` methods
- **CSS Editor Window:** Fixed jQuery-related errors in CSS Editor
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `Cannot read properties of undefined (reading 'toggle')` error
  - Added jQuery detection and conversion for `html` and `this.element` in all methods
  - Fixed World Settings button to open World Config instead of general settings
  - Added missing `_resetApplyButton` method
  - Updated `render()`, `_updateObject()`, `_setupSearchListeners()`, `_performSearch()`, `_highlightCurrentMatch()`, `_replaceCurrent()`, and `_replaceAll()` methods
- **Journal Tools Window:** Fixed jQuery-related errors in Journal Tools
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelectorAll is not a function` and `this.element.querySelector is not a function` errors
  - Added `_getNativeElement()` helper method for jQuery detection
  - Fixed journal page opening when clicking "replace title" in search results
  - Added `_viewJournalPage` helper method with multiple strategies for opening journal pages
  - Added missing `_resetApplyButton` method
  - Updated all methods to use native DOM after jQuery detection
- **Blacksmith Window Query:** Fixed jQuery-related errors in query window
  - Fixed `html.querySelector is not a function` and `html.querySelectorAll is not a function` errors
  - Fixed `html.addEventListener is not a function` error
  - Fixed `this.element.querySelector is not a function` errors in `displayMessage()` and other methods
  - Added `_getNativeElement()` helper method for jQuery detection
  - Added drop zone handlers for criteria drop zone in assistant workspace (skill check assistant)
  - Updated `activateListeners()`, `initialize()`, `displayMessage()`, `_scrollToBottom()`, and `switchWorkspace()` methods

### Changed
- **jQuery Removal:** Continued migration from jQuery to native DOM methods across all application windows
  - All application windows now handle native DOM elements with jQuery detection fallbacks
  - Added `_getNativeElement()` helper method pattern for consistent jQuery detection
  - Replaced jQuery event handlers with native `addEventListener`
  - Replaced jQuery DOM manipulation with native methods (`querySelector`, `appendChild`, `insertBefore`, etc.)
  - Updated XP Distribution, CSS Editor, Journal Tools, and Blacksmith Window Query windows
- **Combat Tracker Structure:** Updated combat tracker HTML structure for v13 compatibility
  - Planning timer now uses `.planning-timer-item` class instead of `.combatant.planning-phase`
  - Roll Remaining button now uses `<button>` element with v13-compatible attributes
  - All selectors updated to match v13 DOM structure
- **Query Tool - Assistant Workspace:** Added drop zone functionality for skill check assistant
  - Added event handlers for criteria drop zone to accept token, actor, and item drops
  - Drop zone now populates skill check form fields automatically when items are dropped
  - Supports drops from canvas (tokens) and sidebar (actors and items)

### Technical
- **Initiative Checks:** Added initiative validation before showing timers
  - Planning timer and combat timer now only appear after all combatants have rolled initiative
  - Prevents timers from appearing prematurely and reduces unnecessary re-renders
- **Hook Priorities:** Adjusted hook priorities for proper execution order
  - Roll Remaining button hook priority set to 5 (runs after planning timer at priority 3)
  - Ensures proper element insertion order in combat tracker
- **Error Handling:** Improved error handling for async operations
  - Added proper delays and error handling for window closing operations
  - Enhanced fallback mechanisms for finding and closing popout windows

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- All combat tracker functionality has been restored and tested in v13
- jQuery removal is complete for combat tracker components and all major application windows
- All application windows (XP Distribution, CSS Editor, Journal Tools, Blacksmith Window Query) now use native DOM with jQuery detection fallbacks


## [13.0.0] - v13 Migration Begins

### Important Notice
- **v13 MIGRATION START:** This version begins the migration to FoundryVTT v13
- **Breaking Changes:** This version requires FoundryVTT v13.0.0 or later
- **v12 Support Ended:** v12.1.23-FINAL was the last version supporting FoundryVTT v12

### Changed
- **Minimum Core Version:** Updated to require FoundryVTT v13.0.0
- **Module Version:** Bumped to 13.0.0 to align with FoundryVTT v13
- **Compatibility:** Module now exclusively supports FoundryVTT v13

### Technical
- **Migration Status:** Beginning v13 migration work
- **Breaking Changes:** Will address v13 API changes including:
  - `getSceneControlButtons` hook API changes (controls from array to object)
  - jQuery removal (migrating to native DOM methods)
  - ApplicationV2 framework migration (planned for future versions)

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- See `documentation/migration-v13-plan.md` for migration plan and progress tracking
- This version may have incomplete v13 compatibility - migration work in progress

## [12.1.23] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Blacksmith compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

### Changed
- **Documentation Updates:** Updated README.md and module.json to reflect v12.1.23 as the final v12 release
- **Compatibility Notice:** Added clear notice that v12.1.23 is the last version supporting FoundryVTT v12
- **Migration Preparation:** Module is now locked for v12 compatibility; v13 migration work will begin in next version

### Technical
- **Version Lock:** Module version locked at 12.1.23-FINAL for v12 compatibility
- **Future Development:** All development moving forward will target FoundryVTT v13 exclusively

## [12.1.22]

### Added
- **Compendium Table Import Support:** Added comprehensive compendium table import functionality for both items and actors
  - New "Compendium Items" template option for rolltable imports
  - New "Compendium Actors" template option for rolltable imports
  - Dynamic compendium list generation from configured settings
  - Formatted item/actor lists with compendium names and entries
  - Template placeholders automatically populated with user's configured compendiums

### Fixed
- **Table Import Range Calculation:** Fixed critical bug in table range calculation logic
  - Properly handles explicit range bounds (rangeLower and rangeUpper)
  - Correctly calculates ranges when only lower bound is provided
  - Prevents gaps and overlaps in range assignments
  - Added validation to ensure rangeLower <= rangeUpper
- **Dynamic Table Formula:** Fixed hardcoded "1d100" formula to dynamically calculate based on actual table range
  - Formula now automatically adjusts to match maximum range value (e.g., 1d20, 1d500)
  - Ensures formula always matches the table's actual range coverage
- **Compendium Type Mapping:** Fixed compendium result type mapping for FoundryVTT compatibility
  - Correctly maps "Compendium" type to "pack" (FoundryVTT's actual type name)
  - Properly sets `documentCollection` field for pack-type results
  - Ensures compendium dropdowns select correct compendium on import
- **ImageCacheManager.addTagToFile Error:** Fixed "addTagToFile is not a function" error when toggling favorites
  - Removed redundant calls to non-existent `addTagToFile()` and `removeTagFromFile()` functions
  - Tags are already updated directly in fileInfo.metadata.tags array
  - Favorite toggle functionality now works correctly

### Changed
- **Table Import UI:** Improved table import dropdown labels for better clarity
  - Simplified option names (e.g., "Simple Text" instead of "Simple Text Rollable Table")
  - Reorganized options for better logical grouping
  - Updated button text to "Copy Template" for consistency

## [12.1.21] - 2025-11-13

### Added
- **Loot Pogs:** Added new images for when tokens are converted to loot.

### Fixed
- **Loot Conversion Sound:** Honored the "No Sound" option by skipping playback when `tokenLootSound` is disabled.
- **Loot Conversion Image:** Restricted loot image swaps to cases where the Item Piles module is active and rely on Item Piles' `keepOriginal` handling instead of forcing a new texture.
- **Loot Image Preservation:** Restoring a loot pile now updates the token document reliably so the original art persists after refresh.
- **Loot Table Quantities:** Loot item counts now randomize between 1 and the configured quantity setting instead of using roll result ranges.
- **Loot Coin Setting:** Coins are only added when the `tokenLootAddCoins` toggle is enabled.
- **Epic Loot Odds:** Epic loot tables now respect the configured odds and always award a single item when triggered.
- **Loot Coin Maximums:** Coin rewards now roll between 1 and the per-currency maximum settings (including electrum) instead of using a static percentile table.
- **Dead Token Toggle:** Dead token replacement now correctly follows the `enableDeadTokenReplacement` setting in both UI and automation hooks.
- **Indicator Visibility:** Current-turn and targeted rings now respect per-user token visibility, hiding from players when tokens are invisible to them.
- **Combat Bar Details:** Secondary combat bar now reports turn order labels and formatted total combat time.


## [12.1.20] - 2025-11-12

### Added
- **Party Statistics Window:** New menubar tool and application providing combat history, lifetime MVP leaderboard, summary chips, and MVP highlights styled after the XP distribution interface.
- **Stats API Exposure:** Stats window data now available through `StatsWindow` and supporting API methods for other modules to consume combat summaries and lifetime MVP data.

### Changed
- **Documentation:** Refreshed `documentation/api-stats.md`, `api-core.md`, and `architecture-stats.md` with updated architecture details, API recipes, retention policies, and integration samples for the stats system.
- **Templates & Styles:** Introduced dedicated `window-stats.hbs` and `styles/window-stats.css` to align party stats UI with the module design system while keeping assets modular for future module splits.

### Fixed
- **Menubar Combat Health Rings:** Health rings now refresh in real time by listening to `updateActor` and `updateToken` hooks and re-rendering the combat secondary bar whenever combatant HP changes.
- **Menubar Visibility Controls:** Honored `excludedUsersMenubar` by skipping menubar/secondary-bar rendering and interactions for listed users, ensuring GM-configured exclusions take effect.
- **NPC Health Privacy Setting:** Added `menubarCombatHideHealthBars` (world) so GMs can hide monster health rings for players while retaining full visibility themselves.


## [12.1.19] - Dynamic Compendium Configuration and Expanded Type Support

### Added
- **Configurable Compendium Counts:** Added per-type settings to configure how many compendium priority slots are available
  - `numCompendiumsActor` - Configure number of Actor compendium slots (1-20, default: 1)
  - `numCompendiumsItem` - Configure number of Item compendium slots (1-20, default: 1)
  - `numCompendiumsSpell` - Configure number of Spell compendium slots (1-20, default: 1)
  - `numCompendiumsFeature` - Configure number of Feature compendium slots (1-20, default: 1)
  - Settings require reload to take effect when changed

- **Selected Compendium Arrays:** New arrays exposed to external modules containing only configured compendiums in priority order
  - `arrSelectedMonsterCompendiums` - Actor compendiums in priority order
  - `arrSelectedItemCompendiums` - Item compendiums in priority order
  - `arrSelectedSpellCompendiums` - Spell compendiums in priority order
  - `arrSelectedFeatureCompendiums` - Feature compendiums in priority order
  - Arrays automatically update when compendium settings change
  - Position in array = Priority (index 0 = Priority 1, etc.)

- **Expanded Compendium Type Support:** Dynamic registration for ALL compendium types found in the system
  - Automatically registers settings for any compendium type (JournalEntry, RollTable, Scene, Macro, Playlist, Adventure, Card, Stack, etc.)
  - All types get full settings support: numCompendiums, searchWorldFirst, searchWorldLast, and priority compendium slots
  - Selected arrays created for all types (e.g., `arrSelectedJournalEntryCompendiums`, `arrSelectedRollTableCompendiums`)
  - No hardcoding required - system adapts to available compendium types

### Changed
- **Compendium Settings Registration:** Refactored from hardcoded Actor/Item/Spell/Feature to fully dynamic system
  - All compendium types now use unified dynamic registration function
  - Settings automatically registered based on types found in system
  - Backward compatible - existing settings and variable names unchanged

- **Compendium Search Logic:** Updated to respect per-type configured counts instead of hardcoded limit of 8
  - `common.js`: Actor and Item compendium search loops now use dynamic counts
  - `manager-compendiums.js`: All compendium type searches respect configured counts
  - `journal-tools.js`: Compendium setting key arrays generated dynamically
  - All search functions now honor user-configured compendium limits

- **Spell and Feature Compendum Filtering:** Switched from content-based to type-based filtering for Spell and Feature compendiums
  - Now uses all Item compendiums like Actor compendiums (simpler and works synchronously)
  - Removed "Spells:" and "Features:" prefixes from dropdown labels since filtering is now type-based
  - Eliminated async complexity from compendium choice initialization
  
- **Removed Duplicate Settings:** Cleaned up duplicate compendium settings from old code organization
  - Removed duplicate `defaultEncounterFolder` setting in favor of `encounterFolder`
  - Removed old hardcoded compendium registration patterns that were superseded by dynamic system
  
- **Code Cleanup:** Removed unused async helper functions from `getCompendiumChoices()`
  - Removed `getContentTypes()` and `buildContentTypeMap()` functions that were no longer needed
  - Simplified compendium choice generation logic

### Fixed
- **Async Function Issue:** Fixed `getCompendiumChoices()` async/await mismatch
  - Function properly marked as `async` to support `await buildContentTypeMap()` call
  - Added `await` when calling `getCompendiumChoices()` in `registerSettings()`
  - Ensures compendium choice arrays are populated before settings registration

- **Race Condition:** Fixed `combatTrackerOpen` setting access before registration
  - Added safety checks using `game.settings.settings.has()` before accessing setting
  - Prevents errors when combat-tracker hook runs before settings are registered
  - Applied to both ready hook and combat start hook contexts
  - Applied to `combatTrackerShowPortraits`, `showRoundTimer`, and `menubarCombatShow`
  - Prevents "setting is not registered" errors during module initialization
  - Imported `getSettingSafely` into affected modules

- **Sync Initialization:** Fixed compendium choices not being available during settings registration
  - Added synchronous initialization of basic compendium choices in `registerSettings()`
  - `getCompendiumChoices()` now runs async in background without blocking settings registration
  - Ensures all compendium dropdowns have choices available immediately

## [12.1.18] - Menubar Performance Optimization, Token Movement Features, and Code Cleanup

### Added
- **Token Movement Sounds:** Complete audio feedback system for token movement
  - Settings for enabling/disabling movement sounds
  - Separate sound selection for player tokens vs monster/NPC tokens
  - Volume control slider (0.0 to 1.0)
  - Distance threshold setting (1-50 feet) to prevent sounds on tiny movements
  - GM-only processing to avoid permission errors
  - Sound plays once (non-looping) and broadcasts to all players
  - Integration with existing movement hooks and automated movement detection

- **Expanded Sound Library:** Added 49 new sound effects across multiple categories
  - **Cartoon Sounds (2):** Tiptoe, Twangs
  - **General Effects (6):** Candle Blow, Cocktail Shaker, Explosion, Owl Hoot, Sad Trombone, Toilet Flushing
  - **Gore Effects (5):** Armor Blood, Blood Splash, Cut Splash, Entrails Splash, Deep Slash
  - **Object Interactions (9):** Chest Lid Open, Chest Open, Chest Poison, Chest Treasure, Lever 01-03, Sack Open Long/Short
  - **Reaction Sounds (18):** Crowd Clapping (Large/Small), Crowd Laughing, Gasp, Grunt Hit/Kick Object, Huzzah, Man Battlecry/Grunt/Huuuragh/Oof/Pain, Wilhelm Scream, Woman Groan/Pain/Scream, plus existing Ahhhhh/Oooooh/Yay
  - **Step Sounds (10):** Beast, Creak 01-03, Metal, Stairs Down/Up, Water, Wood 01-02
  - All sounds organized in subfolders with proper categorization and alphabetical sorting
  - Removed duplicate root folder sounds in favor of organized subfolder versions

### Fixed
- **CRITICAL: Menubar Performance Issue:** Fixed massive performance bottleneck where menubar was re-rendering 14+ times during initialization
  - Root cause: `registerMenubarTool()` was triggering `renderMenubar()` for every single tool registration
  - Solution: Implemented batch tool registration system with single render at completion
  - Added `_isRegisteringTools` flag to prevent renders during tool registration
  - Added `_defaultToolsRegistered` flag to prevent duplicate tool registration
  - Performance improvement: Reduced menubar renders from 14+ to 1 during initialization
  - Tooltip issues resolved as side effect of eliminating constant re-renders

- **Token Image Replacement Threshold Slider:** Fixed threshold slider visibly jumping during image scanning
  - Root cause: `_initializeThresholdSlider()` was being called on every UI re-render during scanning
  - Solution: Added guard clause to prevent re-initialization during active scanning
  - Threshold slider now remains stable during image scanning process

- **Token Rotation Permission Errors:** Fixed permission errors when players tried to rotate tokens
  - Root cause: Token facing logic was running on all clients, causing permission conflicts
  - Solution: Implemented proper permission checking - GM can rotate any token, players can only rotate their own tokens
  - Added `testUserPermission("OWNER")` check for non-GM users
  - Eliminated "User lacks permission to update Token" errors

- **Memory Monitor Tooltip Display:** Fixed memory monitor tooltip showing only memory value instead of detailed information
  - Root cause: Constant menubar re-renders were interfering with tooltip processing
  - Solution: Resolved automatically with menubar performance fix
  - Tooltips now display comprehensive memory breakdown (client heap, server heap, GPU textures)

### Performance
- **Menubar Rendering Optimization:** Dramatically improved menubar initialization performance
  - Eliminated 14+ unnecessary menubar re-renders during tool registration
  - Single render after all tools are registered instead of per-tool renders
  - Expected 90%+ reduction in menubar render operations during module load
  - Improved overall module startup performance

### Code Cleanup
- **Debug Code Removal:** Cleaned up all Phase 1 analysis and debug code
  - Removed verbose comment headers and investigation notes
  - Removed debug logging (`postConsoleAndNotification` calls for monitoring)
  - Removed stack trace logging in `renderMenubar()`
  - Removed "END - HOOKMANAGER CALLBACK" comments
  - Kept only essential functional code and performance optimizations

### Technical Details
- Implemented `MenuBar._isRegisteringTools` flag for batch rendering control
- Implemented `MenuBar._defaultToolsRegistered` flag for duplicate prevention
- Added guard conditions in `registerMenubarTool()` to skip renders during batch operations
- Single `renderMenubar()` call at end of `registerDefaultTools()` instead of per-tool calls
- Maintained all existing functionality while dramatically improving performance

---

## [12.1.17] - Performance Optimizations and Code Cleanup

### Added
- **Memory Monitor Tool:** New performance monitoring tool for the menubar
  - Shows real-time memory usage (client heap, server heap, GPU textures)
  - Configurable poll interval (5 seconds to 5 minutes)
  - Detailed tooltip with comprehensive memory breakdown
  - Click to log detailed memory information to console
  - Cached data to prevent performance impact from frequent API calls

- **Menubar Tool Visibility Settings:** Added individual show/hide controls for menubar tools
  - `Show Settings Tool` - Toggle settings tool visibility (default: hidden)
  - `Show Refresh Tool` - Toggle refresh tool visibility (default: hidden)  
  - `Show Performance Monitor Tool` - Toggle performance monitor visibility (default: hidden)
  - `Performance Monitor Poll Interval` - Slider to set update frequency (5s to 5min, default: 5s)

### Performance
- **Search Performance Dramatically Improved:** Implemented comprehensive caching system for search operations
  - Added LRU cache (50 entries, 5-minute TTL) for search results
  - Cached searches now return results in < 10ms (vs 500-1000ms before)
  - Cache automatically invalidates when filters/tags/categories change
  - Expected 50-90% speedup for repeated searches
  
- **Tag Filtering Optimized:** Pre-compute tags during cache build instead of recalculating on every operation
  - Tags (metadata + creature types + categories) now stored in `file.metadata.tags` during cache build
  - Simplified `_getTagsForFile()` from 50 lines to 10 lines (eliminates heavy Map iterations)
  - Simplified `_getTagsForMatch()` from 65 lines to 18 lines
  - Expected 20-30% speedup on tag filtering operations
  
- **Browse Mode Verified:** Confirmed browse mode uses efficient mapping (no scoring calculations)
  - Browse mode returns results instantly with simple `.map()` operation
  - No relevance calculations performed in browse mode

### Fixed
- **Turn Ring Scene Change Issue:** Fixed turn indicator ring not loading on scene changes
  - Added turn indicator update to `canvasReady` hook callback
  - Turn ring now properly recreates after scene changes using same pattern as death save ring
  - Added safety checks to prevent PIXI graphics destruction errors

- **PIXI Graphics Destruction Safety:** Added safety checks for graphics object destruction
  - Check if graphics object is already destroyed before calling `destroy()`
  - Check if canvas/parent exists before removing from canvas
  - Prevents "Cannot read properties of null" errors during scene changes

- **Progress Bars Not Updating:** Fixed progress bars not showing during image scanning
  - Root cause: `updateScanProgress()` updated window properties but template read from cache properties
  - Solution: Update both window AND cache properties in `updateScanProgress()` and `completeScan()`
  - Added immediate window render when scanning starts to show progress bars
  - Progress bars now show and update correctly during scanning operations

### Removed
- **Legacy Code Cleanup:** Deleted 305+ lines of unused/redundant code
  - Removed entire `_streamSearchResults()` method (215 lines) - legacy duplicate search logic using old scoring
  - Simplified tag extraction methods (90 lines saved)
  - Removed redundant creature type and folder path calculations from UI layer

### Changed
- **Architecture**: Search result cache appropriately placed in UI layer (`token-image-replacement.js`)
  - Cache manager (`manager-image-cache.js`) focuses on file system and persistent storage
  - Matching manager (`manager-image-matching.js`) remains stateless algorithm logic
  - Window (`token-image-replacement.js`) handles UI orchestration and performance caching

### Technical
- Added `_generateSearchCacheKey()` for unique cache key generation
- Added `_getCachedSearchResults()` with TTL expiration checking
- Added `_cacheSearchResults()` with LRU eviction strategy
- Added `_invalidateSearchCache()` called on filter/tag/category changes
- Added `_enhanceFileTagsPostCategorization()` to pre-compute all tags during cache build
- Added performance logging (`console.time/timeEnd`) for search operations

---

## [12.1.16] - Token Image Replacement Fixes and Code Cleanup

### Fixed
- **Category Tooltips Showing 0 Counts:** Fixed category buttons displaying incorrect file counts
  - Root cause: Cache was storing files with empty `path` properties
  - Solution: Updated all filtering methods to extract relative paths from `fullPath` when `path` is empty
  - Applied fix to `_countFilesInCategory()`, `_getFilteredFiles()`, `_getAggregatedTags()`, `_getTagsForMatch()`, and `_getTagsForFile()`
  - Category tooltips now show correct file counts

- **Selected Tab Not Showing Results:** Fixed selected tab filtering to 0 results when token is selected
  - Root cause: Same empty `path` property issue affecting file matching
  - Solution: Updated selected tab filtering logic to properly extract relative paths
  - Selected tab now correctly shows matching files based on token characteristics

- **Favorites Tab Not Showing Actual Favorites:** Fixed favorites tab showing tags but no actual favorited files
  - Root cause: `_getFileInfoFromCache()` was looking up files by empty `fileName` strings
  - Solution: Use file objects directly from cache iteration instead of re-lookup by name
  - Favorites tab now correctly displays all favorited files (ignoring relevance)

- **Tag Display Issues:** Fixed aggregated tags not showing correctly in category and selected modes
  - Root cause: Inconsistent path handling between category discovery and file filtering
  - Solution: Unified path extraction logic across all tag-related methods
  - Tags now display correctly for all filter modes (All, Selected, Favorites, Categories)

### Changed
- **Eliminated Hardcoded Path Assumptions:** Removed all hardcoded folder name assumptions from tag system
  - Replaced hardcoded `ignoredFolders` array with dynamic retrieval from `tokenImageReplacementIgnoredFolders` setting
  - Replaced hardcoded path depth assumptions and `FA_Tokens_Webp` checks with dynamic logic using `tokenImageReplacementPath` setting
  - Module now adapts to any user folder structure without requiring specific naming conventions

- **Code Organization:** Improved separation of concerns in token image replacement system
  - Moved dead token management functions to `token-image-utilities.js` for better organization
  - Updated `ImageCacheManager` to use dynamic category discovery instead of hardcoded categories
  - Added `getDiscoveredCategories()` and `getCategoryFromFilePath()` methods for flexible path handling

### Technical Improvements
- **Dynamic Category Discovery:** Categories are now derived from actual cache data instead of hardcoded assumptions
  - `ImageCacheManager.getDiscoveredCategories()` dynamically discovers top-level categories from `cache.folders`
  - Respects user settings for ignored folders and base path configuration
  - Categories automatically adapt to user's folder structure

- **Consistent Path Handling:** Unified path interpretation across all filtering and tagging methods
  - All methods now consistently use relative paths for category determination
  - Proper fallback from `file.path` to extracted relative path from `file.fullPath`
  - Eliminated inconsistencies between cache storage format and usage patterns

### Code Cleanup
- **Removed Debug Logging:** Cleaned up excessive debug logging that was causing console spam
  - Removed 46,000+ debug log entries that were cluttering console output
  - Kept essential logging for troubleshooting while removing verbose iteration logs

- **TODO List Maintenance:** Cleaned up and reorganized TODO.md for better tracking
  - Removed completed items to focus on active tasks
  - Removed priority numbers and icons for cleaner presentation
  - Marked "Targeted Indicators" as completed
  - Confirmed "HookManager Return Value Handling" was already fixed

### Performance
- **Reduced Memory Usage:** Eliminated unnecessary file lookups in favorites filtering
  - Direct file object usage instead of cache re-lookup reduces function call overhead
  - More efficient filtering logic for large image collections


## [12.1.15] - Memory Leak Fix

### Fixed
- **CRITICAL: Memory Leak (7.9GB RAM Usage):** Fixed catastrophic memory leak causing browser crashes
  - Eliminated temporary window instance creation in `_findBestMatch()` - was creating thousands of full window instances
  - Added static scoring methods to prevent window instance accumulation
  - Fixed unbounded `allMatches` array growth with duplicate detection and 2000 result limit
  - Added comprehensive memory cleanup on window close (arrays, images, event listeners)
  - Explicitly clear image `src` attributes to release decoded image data from browser memory
  - Cancel ongoing searches and timeouts on window close
  - Expected memory usage reduced from 7.9GB+ to under 500MB for 11k+ image cache

- **Category Filter Tabs Broken:** Fixed all category filters returning 0 results
  - Fixed path parsing logic to handle both relative (`Adventurers/...`) and full path formats
  - Applied fix to 3 locations: `_getFilteredFiles()`, `_getAggregatedTags()`, and `_findBestMatch()`
  - Category tabs (Adventurers, Adversaries, Creatures, NPCs) now work correctly

### Changed
- **Result Limits:** Implemented maximum 2000 results per search to prevent memory exhaustion
  - Search stops automatically when limit reached with console notification
  - Duplicate results are now filtered before adding to prevent accumulation

## [12.1.14] - 2025-01-19

### Fixed
- **Cache Validation Bug:** Resolved critical issue where server-side cache was saved successfully but failed validation on load
  - Cache data contained `creatureType` (singular) but validation looked for `creatureTypes` (plural)
  - Added support for both `creatureType`, `creatureTypes`, and compressed `ct` property names
  - Cache validation now handles all property name variations correctly
  - Fixed cache loading after refresh on Molten hosting environments

- **Emergency Cache Recovery:** Fixed cache loading that was incorrectly rejecting valid 3.11MB cache data
  - 11,568 files, 100 folders, and 12 creature types now load successfully
  - Eliminates need to rescan after browser refresh
  - Ensures 29+ minute scan sessions are preserved across sessions

### Changed
- **Cache Property Validation:** Enhanced cache validation to handle multiple property name formats
  - Supports `creatureType` (singular), `creatureTypes` (plural), and `ct` (compressed)
  - Maintains backward compatibility with all existing cache formats
  - More robust validation prevents false cache invalidation

## [12.1.13] - 2025-01-19

### Added
- **Server-Side Cache Storage:** Implemented game.settings-based cache storage for hosted environments
  - Cache now saves to server-side game.settings instead of browser localStorage
  - Persists across browser refreshes and different client connections
  - Compatible with Molten Hosting and other remote FoundryVTT servers
  - Shared cache across all GMs and players in the world
  - Maintains all existing compression and streaming benefits

- **Enhanced Cache Persistence:** Added robust server-side cache management
  - Incremental saves during scan process to preserve progress
  - Final save with complete fingerprint for validation
  - Automatic fallback and validation for cache integrity
  - Console commands updated to show server-side cache status

### Fixed
- **Molten Hosting Cache Loss:** Resolved critical issue where cache was lost on browser refresh
  - localStorage was browser-specific and not persisting on remote servers
  - Cache now stored in world database via game.settings
  - Survives server restarts and browser session changes
  - Works seamlessly across different devices and browsers

- **Cross-Client Cache Sharing:** Fixed issue where cache was isolated per browser session
  - All players and GMs now share the same cached token data
  - No need to rescan when switching devices or browsers
  - Consistent token replacement experience for all users

### Changed
- **Cache Storage Location:** Migrated from localStorage to game.settings
  - Primary storage now in server database (persistent across sessions)
  - Maintains backward compatibility with existing cache format
  - All console commands updated to reflect server-side storage
  - Cache size and compression benefits retained

- **Cache Loading Logic:** Updated to prioritize server-side cache over localStorage
  - Loads from game.settings first, falls back to localStorage if needed
  - Validates cache integrity and version compatibility
  - Clear messaging about cache source (server vs. browser)

## [12.1.12] - Cache Compression

### Added
- **Streaming Cache Compression:** Implemented memory-efficient cache compression system to solve localStorage quota issues
  - Builds compressed cache data without creating full JSON objects in memory
  - Reduces cache size by 40-60% through property name shortening and whitespace removal
  - Handles large token collections (10,000+ files) without quota exceeded errors
  - Backward compatible with existing cache format

- **Enhanced Console Commands:** Added comprehensive cache debugging tools
  - `coffeePubCache.info()` - Display cache statistics (files, folders, creature types, scan status)
  - `coffeePubCache.size()` - Show compressed vs uncompressed cache size with compression ratio
  - `coffeePubCache.version()` - Display cache version and basic information
  - `coffeePubCache.clear()` - Clear cache from localStorage
  - `coffeePubCache.quota()` - Test localStorage quota availability

- **Cache Size Display:** Added cache storage size to UI status display
  - Shows actual localStorage footprint alongside file count and age
  - Updates dynamically when cache changes
  - Format: "1969 files, 0.8 hours old, 0.53MB"

### Fixed
- **localStorage Quota Exceeded:** Resolved critical issue where large token collections (8.64MB+) failed to save
  - Streaming compression prevents memory issues during cache building
  - No longer hits browser localStorage limits (typically 5-10MB)
  - Cache now saves successfully for collections with 10,000+ files

- **Cache Save Reliability:** Improved cache persistence during long scans
  - Streaming compression reduces save failures
  - Better error handling for storage quota issues
  - Fallback mechanisms if compression fails

### Changed
- **Cache Storage Format:** Optimized internal cache structure for better compression
  - Shortened property names (e.g., "fullPath" → "fp", "fileName" → "fn")
  - Removed unnecessary whitespace from JSON structure
  - Maintains full backward compatibility with existing caches

- **Save Progress Messages:** Updated cache save notifications to show actual compressed size
  - Clear indication of storage footprint: "Cache saved: 0.53MB (1969 files)"
  - Removed misleading compression ratio estimates
  - More accurate reporting of actual storage usage


## [12.1.11] - Token Image Replacement Enhancements

### Added
- **3-State Tag Filter Toggle:** Enhanced tag sorting with three modes:
  - Count mode: Sort tags by frequency (default)
  - Alpha mode: Sort tags alphabetically
  - Hidden mode: Completely hide tag container
  - Visual feedback with distinct icons for each mode (fa-filter, fa-filter-list, fa-filter-circle-xmark)
  - Persistent mode selection across sessions

- **Ignored Words Filter:** Added powerful file exclusion system with wildcard support:
  - Completely excludes matching files from cache scanning
  - Supports multiple wildcard patterns: exact match, starts with (*word), ends with (word*), contains (*word*)
  - File extension filtering (e.g., *.png, *.jpg)
  - Tracks and reports ignored file count in scan completion messages
  - Significantly reduces cache size for large token collections

### Fixed
- **Automatic Cache Updates:** Fixed automatic update system to use incremental scans instead of full scans when changes are detected
  - Automatic updates now properly call `_doIncrementalUpdate()` instead of `_scanFolderStructure()`
  - Much faster update performance when "Automatically Update Image Cache" is enabled
  - Preserves existing cache data during automatic updates

- **Folder Count Display:** Fixed completion message to show accurate number of scanned folders
  - Added `totalFoldersScanned` property to track actual non-ignored directory count
  - Completion messages now display correct folder count instead of only folders containing files

### Changed
- **Debug Logging Cleanup:** Converted internal progress and processing messages to debug-only mode
  - Reduced console noise during normal operation
  - Critical errors and user-facing messages remain visible
  - Improved debugging experience with properly flagged messages



## [12.1.10] - Character Import System and Enhanced Cache Size Monitoring

### Added
- **Character Import System:** Added comprehensive character import system with advanced properties:
  - Character type configuration (npc, player, monster)
  - Currency configuration with type and amount
  - Feature configuration with name and description
  - Spell configuration with name and description

### Added
- **Enhanced Cache Size Monitoring:** Added automatic size monitoring with warnings when cache approaches localStorage limits (8MB threshold)
  - Automatic fallback logic: File → localStorage quick cache → old localStorage format → rebuild
  - Cache directory auto-creation and management
  - Seamless migration from old localStorage-only format to hybrid system

### Fixed
- **CRITICAL: Token Image Cache System:** Fixed multiple critical bugs causing cache data loss and scan failures:
  - Error handling now saves partial cache with proper fingerprint even when scans fail
  - Incremental updates properly handle null/invalid fingerprints instead of infinite rescan loops
  - Finally block ensures cache status updates and UI renders correctly after errors
  - Enhanced fingerprint validation detects and handles `null`, `'error'`, and `'no-path'` states gracefully
  - Added comprehensive error logging with stack traces, cache diagnostics, and storage quota details
  - Cache now persists reliably even when scan errors occur, preventing loss of incremental progress
  - Enhanced localStorage cache with size monitoring and quota exceeded protection
  - Cache survives browser cache clearing and module updates

## [12.1.9] - Menu Bar System and Enhanced Consumable Item Import System

### Added
- **Menu Bar System:** Introduced a comprehensive menu bar for quick access to module features:
  - Current combatant display with portrait, name, HP, and conditions
  - Party leader display with initiative and status
  - Quick access buttons for frequently used tools
  - Configurable visibility and position settings
  - Real-time updates during combat
- **Simplified Item Import Options:** Streamlined item import dropdown to two clean options: "Loot" and "Consumables"
- **Enhanced Consumable Item Support:** Added comprehensive consumable item import with advanced properties:
  - Consumable type configuration (ammunition, food, poison, potion, rod, scroll, trinket, wand)
  - Magical property detection and attunement requirements
  - Usage tracking with spent/max uses and auto-destroy behavior
  - Recovery system with configurable periods (Long Rest, Short Rest, Day, etc.)
- **Activity System Integration:** Implemented full activity support for consumable items:
  - Multiple activities per item (Heal, Attack, Cast, Check, Damage, etc.)
  - Activity-specific effect configuration with dice formulas
  - Chat flavor text for activity descriptions
  - Proper FoundryVTT activity data structure with unique IDs
- **RollTable Import Utility:** Added comprehensive rolltable import system with multiple result types:
  - Text results with descriptions and weights
  - Document results linking to world actors/items with automatic matching
  - Compendium results with collection references
  - Support for "Draw with Replacement" and "Display Roll Formula" settings
- **Dynamic Prompt Generation:** Enhanced prompt templates with placeholder replacement:
  - Campaign name and rulebooks integration across all prompts
  - Dynamic actor lists for "Document: Actor" rolltables
  - Dynamic item lists for "Document: Item" rolltables
  - Automatic placeholder substitution during template copying

### Fixed
- **Consumable Property Mapping:** Fixed magical property detection using correct FoundryVTT field names (`properties.mgc`)
- **Activity Effect Configuration:** Resolved healing effect field mapping to use proper HTML field names:
  - `healing.number` for dice count
  - `healing.denomination` for die type (converted from "d8" to "8")
  - `healing.bonus` for bonus values
  - `healing.types` for effect type selection
- **Recovery System Validation:** Fixed recovery formula validation errors by using numeric values instead of text descriptions
- **RollTable Document Type Assignment:** Corrected document type assignment for rolltable results using proper field names (`documentCollection`)
- **Activity ID Generation:** Fixed activity ID format to meet FoundryVTT's 16-character alphanumeric requirements

### Changed
- **Unified Prompt Structure:** Consolidated item prompts to include both JSON and image generation instructions in single files
- **Enhanced Field Support:** Expanded consumable item fields to support all FoundryVTT consumable properties:
  - `consumableType`, `consumptionMagical`, `magicalAttunementRequired`
  - `limitedUsesSpent`, `limitedUsesMax`, `destroyOnEmpty`
  - `recoveryPeriod`, `recoveryAmount` (auto-calculated)
- **Improved Error Handling:** Enhanced validation and error handling throughout the import system
- **Scalable Activity Architecture:** Designed activity system to support multiple activity types with proper effect configuration

### Technical Details
- Updated `parseFlatItemToFoundry()` function with comprehensive consumable item support
- Implemented `parseTableToFoundry()` function for rolltable data conversion
- Added helper functions for world actor/item list generation
- Enhanced placeholder replacement system with `getTablePromptWithDefaults()`
- Fixed FoundryVTT data structure compliance for all imported item types



## [12.1.8] - Beginning of migration to version 13

### New
- **Modified Compatability**: Mod now on track to support FoundryVTT version 13

## [12.1.7] - XP Distribution System Complete Overhaul

### Added
- **Dual-Mode XP System:** Implemented independent Experience Points and Milestones modes
  - Experience Points mode: Monster-based XP calculation with resolution types
  - Milestones mode: Manual XP input with category, title, and description fields
  - Both modes can be active simultaneously with combined XP totals
  - Toggle controls for each mode with proper UI visibility management
- **Menubar Integration:** Added XP Distribution tool to GM Tools section of menubar
  - Accessible via "GM Tools" → "XP Distribution" button
  - Works independently of combat tracker - no active combat required
  - Integrates with existing menubar API and tool registration system
  - Maintains consistent UI/UX with other menubar tools
- **Non-Combat XP Distribution:** Added XP distribution window accessible from GM Tools menubar
  - Works without active combat by loading all canvas monsters
  - Defaults to "Removed" status for all monsters in non-combat mode
  - Maintains full monster data for dynamic resolution changes
  - Defaults to Milestones mode ON, Experience Points mode OFF when no combat active
- **Enhanced Monster Resolution System:** Expanded resolution types with proper multipliers
  - Defeated (1.00x), Escaped (0.60x), Captured (1.20x), Negotiated (1.50x), Ignored (0.20x), Removed (0.00x)
  - Visual resolution icons with tooltips and multiplier display
  - Real-time XP calculation updates as resolutions change
- **Player Adjustment Controls:** Added intuitive plus/minus buttons for individual player XP adjustments
  - Visual +/- buttons replace confusing input-only system
  - Error trapping prevents negative XP (rounds to 0)
  - Maintains existing player inclusion/exclusion functionality
- **Sticky Footer Layout:** Implemented proper flexbox layout for XP distribution window
  - Sticky header, scrollable middle content, sticky footer
  - Action buttons always visible at bottom regardless of window size
  - Responsive design that works at any window height

### Fixed
- **XP Calculation Discrepancies:** Resolved circular dependency bug in XP calculations
  - Fixed stale data issues where monster resolution changes didn't update totals
  - Unified player data loading between combat and non-combat modes
  - Ensured consistent XP calculations across all entry points
- **Character HP Corruption:** Fixed critical bug causing character death after XP distribution
  - Removed problematic `diff: false` and `recursive: false` flags from actor updates
  - Prevented infinite reactivity loops in FoundryVTT's actor update system
  - Characters now maintain proper HP values after XP distribution and browser refresh
- **Player Level Display:** Fixed missing player levels in combat mode
  - Unified player data structure between combat and non-combat entry points
  - Ensured consistent level information display across all modes
- **Monster Base XP Calculation:** Fixed CR-to-XP conversion for fractional challenge ratings
  - Converted CR table to use decimal keys (0.5, 1.5, etc.) instead of string keys
  - Added proper CR conversion helper for accurate XP calculations
  - Fixed "CR 0.5 monsters showing 0 XP" issue
- **Chat Card Display Logic:** Enhanced XP distribution results chat card
  - Filters out "REMOVED" monsters from display
  - Conditionally shows Experience Points and Milestones sections based on enabled modes
  - Fixed "LEVEL UP!" display for players with negative `nextLevelXp`
  - Shows total XP and XP to next level instead of just XP gained
- **Milestone Data Persistence:** Fixed milestone form data not appearing in chat card
  - Properly collects category, title, and description from form inputs
  - Uses direct jQuery `.val()` access instead of FormData (no form tag in template)
  - Ensures milestone data is captured before XP distribution

### Improved
- **UI/UX Consistency:** Standardized styling and layout across XP distribution interface
  - Consistent label styling with `class="label"` for all form elements
  - Side-by-side layout for milestone Experience Points input and Category select
  - Proper spacing and alignment for all form elements
  - Unified CSS targeting with data attributes instead of class-based selectors
- **Error Handling:** Enhanced robustness throughout XP distribution system
  - Added comprehensive error trapping for negative XP values
  - Improved actor update error handling with proper try-catch blocks
  - Added validation for player data before processing
  - Graceful handling of missing or invalid actor references
- **Performance Optimization:** Streamlined XP calculation and update processes
  - Removed unnecessary re-rendering on mode toggle changes
  - Implemented efficient jQuery show/hide instead of full template re-rendering
  - Optimized event handling to prevent duplicate calculations
  - Reduced console logging overhead in production

### Technical Improvements
- **Code Architecture:** Refactored XP distribution system for maintainability
  - Centralized XP calculation logic in `updateXpCalculations()` method
  - Unified player data loading with `loadPartyMembers()` static method
  - Separated concerns between data collection, calculation, and display
  - Improved method organization and reduced code duplication
- **Data Structure Consistency:** Standardized XP data object structure
  - Consistent player data format across combat and non-combat modes
  - Proper initialization of milestone data structure
  - Unified monster data format with all required fields
  - Eliminated data structure mismatches between different entry points



## [12.1.6] - Token Image Replacement System Enhancements

### Added
- **Favorites System:** Added comprehensive favorites functionality for token images
  - New "Favorites" filter tab in the category filters (left of "Selected")
  - Right-click any image thumbnail to favorite/unfavorite it
  - Favorites are stored persistently in the image cache metadata
  - Favorites filter shows only favorited images plus original/current image cards when token is selected
- **Visual Favorites Indicators:** Added heart icon badges for favorited images
  - Red heart icon appears in top-left corner of favorited image thumbnails
  - Clean design without background circle, matching other UI favorites styling
  - Heart icon has dark shadow for visibility against light backgrounds

### Fixed
- **Cache Completion Notifications:** Fixed multiple issues with cache scanning completion
  - "Delay Cache" button now properly changes back to "Scan for Images" when scan completes
  - In-window notification now shows completion status instead of scanning status
  - Added detailed completion data showing files found, folders scanned, and scan duration
  - Fixed incremental scans not completing gracefully in the UI
- **Progress Bar Issues:** Fixed "Phase 5 of 6" progress bar anomaly for large directories
  - Removed phantom 6th step that was causing progress bar to get stuck
  - Added progress validation to ensure completion state is properly triggered
  - Added timeout protection (3 hours) for long-running scans to prevent indefinite hanging
- **Player Character Support:** Fixed window dimming issue when selecting player characters
  - Added proper error handling to hide search spinner overlay on token selection errors
  - Enhanced token data extraction to handle player character data structure
  - Added type checking for potentially undefined properties before calling string methods
  - Player characters now default to 'humanoid' creature type, use race/ancestry for subtype, class for background, and 'medium' size
- **Original Image Preservation:** Fixed original image storage when applying images from the window
  - Original token image is now saved before applying new image (only if original doesn't already exist)
  - Maintains consistency with drop-to-apply behavior
  - Ensures original image can always be restored

### Improved
- **Cache Management:** Enhanced cache scanning with better error handling and completion detection
  - Added completion state tracking with `justCompleted` and `completionData` fields
  - Improved UI state management to prevent race conditions between scanning and completion
  - Added safety mechanisms for long-running operations
- **Token Data Extraction:** Improved robustness of token data parsing
  - Added comprehensive type checking for all string operations
  - Better handling of different actor data structures (NPCs vs Player Characters)
  - More reliable search term generation for better image matching
- **Favorites Integration:** Seamlessly integrated favorites with existing tag system
  - Favorites use the existing metadata tag system for consistency
  - Favorites filter works like other category filters (not as a hack)
  - Original and current image cards always show when token is selected, regardless of filter

### Technical Details
- Updated `scripts/token-image-replacement.js` with comprehensive favorites functionality
- Enhanced `templates/window-token-replacement.hbs` with favorites filter button
- Updated `styles/window-token-replacement.css` with clean favorites styling
- Fixed case sensitivity issues in cache file lookups (files stored with lowercase keys)
- Improved error handling and debugging throughout the image replacement system


## [12.1.5] - Token Movement System Enhancements

### Fixed
- **Token Movement Locking:** Fixed critical issue where players could still move tokens even when movement was set to "locked" mode
- **HookManager Return Value Handling:** Modified HookManager to properly handle return values from `preUpdateToken` hooks, allowing movement restrictions to actually block token updates
- **Movement Restriction Enforcement:** Players now receive warning messages AND movement is properly blocked when in "no-movement" mode

### Technical Details
- Updated `scripts/manager-hooks.js` to capture and respect return values from `preUpdateToken` hook callbacks
- When any `preUpdateToken` callback returns `false`, the entire hook chain now returns `false` to block the action
- This ensures FoundryVTT properly respects movement restriction settings

### TODO
- **HookManager Priority System:** Consider implementing proper priority-based execution order for hook callbacks (currently hooks run in registration order, not priority order)
- **Comprehensive Hook Testing:** Test all hook types to ensure the return value handling doesn't break other functionality


## [12.1.4] - Token Image Replacement System Enhancements

### Added
- **Original Image Tracking:** Tokens now store their original image when first dropped, allowing users to revert to the initial image
- **Original Image Card:** Added "Original Image" card as the first result in the Token Image Replacement window with purple styling
- **Double-Middle-Click Support:** Double-middle-click on any token to instantly open the Token Image Replacement window with that token selected
- **Update Dropped Tokens Setting:** New world setting to control whether tokens are automatically updated when dropped on the canvas
- **Fuzzy Search Toggle:** New toggle for manual search box input - when enabled, searches for individual words independently
- **Threshold Display Enhancement:** Moved threshold percentage from slider to label for better readability (e.g., "Matching Threshold 32%")
- **Current Image Tag:** Added "CURRENT IMAGE" tag to clearly identify the currently selected token's image

### Fixed
- **Duplicate Object Key:** Removed duplicate "kobold" entry from monster-mapping.json that was causing JSON parsing errors
- **Selected Token Card Visibility:** Fixed issue where selected token card would disappear when relevance score was below threshold
- **Current Image Tag Display:** Fixed "CURRENT IMAGE" tag not appearing consistently for selected tokens
- **Scoring Algorithm:** Improved relevance scoring calculation for more accurate image matching (Brown Bear now scores 55%+ instead of 15%)
- **Results Blanking:** Fixed window results being cleared after applying an image to a token - now properly refreshes
- **Fuzzy Search Scope:** Corrected fuzzy search to only apply to manual search box input, not automatic token matching
- **Original Image Persistence:** Fixed original image data to be stored in token flags for persistence across sessions
- **Memory Leaks:** Fixed potential memory leaks with proper event listener cleanup and HookManager usage
- **TypeError in Token Context:** Fixed TypeError when metadata fields are not strings in `_calculateTokenContextBonus`

### Changed
- **Image Application Flow:** After applying an image, the window now closes for a cleaner user experience
- **Token Selection Detection:** Added global token selection hook to detect token changes system-wide
- **Scoring System:** Restored user-configurable weights for more accurate and customizable scoring
- **Debug Logging:** Removed excessive debug logging that was slowing down search performance
- **Window Refresh Logic:** Simplified window refresh to use the same code path as the toolbar button

### Technical Details
- Implemented `_storeOriginalImage()` and `_getOriginalImage()` methods using token flags for persistence
- Added `_addMiddleClickHandler()` with proper cleanup via `_removeMiddleClickHandler()`
- Enhanced `_sortResults()` to prioritize original images first, then current images
- Updated `_applyImageToToken()` to close window after successful image application
- Fixed `_getTagsForMatch()` to handle original images without metadata
- Improved `_calculateRelevanceScore()` with better maxPossibleScore calculation
- Added proper memory management with HookManager integration



## [12.1.3] - NEW Token Image Replacement System

### Added
- **Token Image Replacement System:** Complete token image replacement functionality with automatic matching and manual selection
- **Dual Use Case Support:** Separate logic for automatic replacement (best match) vs manual selection (all matches)
- **Token Image Replacement Window:** Dedicated UI window for GMs to manually select token images from available alternatives
- **Cache Management System:** Comprehensive image caching with incremental updates, pause/resume, and storage persistence
- **CoffeePub Toolbar Integration:** Added Token Image Replacement button to CoffeePub toolbar for easy access
- **Progress Tracking:** Real-time progress bars showing scan status with detailed folder and file information
- **Smart Cache Updates:** Incremental update system that only rescans when folder structure changes
- **Confirmation Dialogs:** User-friendly dialogs for scan type selection (Incremental Update vs Full Rescan vs Cancel)
- **Token Selection Detection:** Automatic detection of currently selected tokens when window opens
- **Multiple Match Display:** Shows up to 11 alternative images plus current image (12 total) in thumbnail grid
- **Current Image Highlighting:** Green checkmark and border to identify the currently assigned token image

### Fixed
- **Cache Age Calculation:** Fixed incorrect cache age display (was showing 488,232 hours instead of reasonable values)
- **Cache Persistence:** Resolved cache being cleared on every client reload
- **SUPPORTED_FORMATS Context:** Fixed undefined errors in folder fingerprinting and file processing
- **Search Threshold:** Lowered matching threshold from 0.5 to 0.3 for better match detection
- **Multiple Match Display:** Fixed window showing only 1 match instead of all available alternatives
- **Infinite Render Loop:** Prevented Foundry crashes caused by render loop issues
- **Automatic Scanning Bypass:** Fixed scans starting even when auto-update setting was disabled
- **FilePicker Scope:** Corrected FilePicker.browse calls to use 'data' instead of 'public' scope
- **Incremental Cache Processing:** Ensured files are added to cache immediately during scanning
- **Token Selection Hook:** Fixed token selection not working when window opens with token selected

### Changed
- **Cache Management:** Replaced confusing cache settings with single "Automatically update image cache" checkbox
- **Dialog Buttons:** Updated scan confirmation dialog with proper button labels (Incremental Update, Full Rescan, Cancel)
- **Search Algorithm:** Enhanced matching algorithm to find multiple alternatives for manual selection
- **Progress Display:** Improved progress bar text with detailed folder paths and file counts
- **Cache Storage:** Implemented incremental saves during long scans to prevent data loss
- **Error Handling:** Enhanced error handling with detailed logging and user notifications

### Technical Details
- Implemented `TokenImageReplacement` class with comprehensive cache management
- Added `TokenImageReplacementWindow` for manual token image selection
- Created `_doIncrementalUpdate()` method for efficient cache updates
- Enhanced `_findMatches()` method to display all alternatives for manual selection
- Fixed `_saveCacheToStorage()` to handle incremental saves properly
- Updated `_generateFolderFingerprint()` to use correct FilePicker scope
- Implemented proper hook registration/unregistration for token selection
- Added comprehensive debugging and logging throughout the system

## [12.1.2] - NEW Toolbar Manager

### Added
- **Dynamic Toolbar System:** Implemented comprehensive toolbar management system with dynamic tool registration and zone-based organization
- **Zone System:** Added 6 predefined zones (general, rolls, communication, utilities, leadertools, gmtools) for logical tool grouping and visual organization
- **Three-Tier Visibility System:** Implemented GM/Leader/Player visibility controls with proper permission checking
- **Token Toolbar Integration:** Added Request Roll tool to Foundry's default token control toolbar alongside existing tools
- **Toolbar Settings:** Added client-side settings for toolbar dividers and labels with proper scope management
- **Leader System Integration:** Integrated party leader detection with toolbar visibility and vote system
- **CSS Zone Styling:** Added `toolbar-zones.css` with zone-specific background colors and visual dividers
- **Toolbar Refresh Logic:** Implemented automatic toolbar refresh when party leader changes or settings update
- **External Module API:** Exposed comprehensive toolbar API for external modules to register custom tools
- **Utility Function Exposure:** Added 11 utility functions to API (getActorId, getTokenImage, getPortraitImage, getTokenId, trimString, toSentenceCase, objectToString, stringToObject, convertSecondsToRounds, convertSecondsToString, clamp)
- **OpenAI API Separation:** Refactored OpenAI functionality into dedicated `api-openai.js` with improved error handling and validation
- **Model Support Update:** Added support for latest OpenAI models (GPT-5, GPT-4o, GPT-4o-mini, O1 models) with updated pricing calculations
- **Session Memory System:** Implemented persistent conversation memory with session-based context management for AI interactions
- **Persistent Storage:** Added localStorage-based memory persistence that survives page refreshes and FoundryVTT restarts
- **OpenAI Projects Support:** Added optional OpenAI Projects integration for better cost tracking and team management
- **API Documentation:** Created complete API documentation with examples for all exposed functions

### Changed
- **Consolidated Architecture:** Merged separate `BlacksmithToolbarManager` class into `manager-toolbar.js` for simplified management
- **Tool Registration:** Migrated from hardcoded tool arrays to dynamic `Map`-based registration system
- **Vote System Integration:** Updated vote manager to use consistent leader detection logic across all systems
- **Leader Detection:** Improved party leader detection with timing safeguards and setting availability checks
- **Toolbar Hooks:** Enhanced `getSceneControlButtons` hook to support both Blacksmith and Foundry toolbars

### Fixed
- **Visibility Logic Bug:** Fixed `else if` structure in token toolbar visibility checking to prevent overrides
- **Leader Timing Issues:** Resolved party leader detection timing problems during initial load
- **Vote Permissions:** Fixed vote system to allow leaders to start regular votes (not leader votes)
- **Toolbar Refresh:** Added delayed refresh mechanism to ensure settings are loaded before toolbar rendering
- **Duplicate Prevention:** Added checks to prevent duplicate tools in token toolbar
- **Setting Registration:** Fixed toolbar settings registration timing and scope issues

### Technical Details
- **Tool Data Structure:** Enhanced tool objects with `zone`, `order`, `gmOnly`, `leaderOnly` properties
- **Hook Management:** Added `settingChange` hook for automatic toolbar refresh on leader changes
- **Error Handling:** Improved error handling for missing settings and invalid tool registrations
- **Performance:** Optimized tool lookup and rendering with efficient Map-based storage
- **Documentation:** Updated `architecture-toolbarmanager.md` with complete implementation details


## [12.1.1] - BREAKING PATCH

### Fixed
- **Missing Files:** forgot to add some files to the release.

## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Module-Specific Release Naming:** Updated release workflow to create `coffee-pub-blacksmith.zip` instead of generic `module.zip` for better module identification and management.
- **Unified Header System:** Created `partial-unified-header.hbs` template for consistent header styling across skill check dialog and roll window
- **Actor Portrait Support:** Added actor portrait display in roll window header next to actor name
- **Real-Time Formula Updates:** Added live formula updates when situational bonus or custom modifier changes, with blue text highlighting modifications
- **Roll Mode Visibility System:** Implemented comprehensive roll mode handling (Public, Private GM, Blind GM, Self Roll) with proper visibility controls in chat cards
- **Ownership-Based Controls:** Added ownership checks for roll buttons, disabling non-owner interactions with visual feedback
- **Chat Scrolling:** Added automatic chat scrolling to bottom when roll results are updated
- **Roll Request Sound:** Added sound notification when roll requests are posted to chat
- **Schema-Driven Roll Architecture:** Designed complete D&D 5e roll rules system with:
  - `dnd5e-roll-rules.js` - Pure JavaScript export of D&D 5e mechanics schema
  - `rules-service.js` - Singleton service for rule management, feature detection, and caching
  - `resolve-check-pipeline.js` - Ability check resolution with JOAT, Remarkable Athlete, and Reliable Talent
  - `resolve-save-pipeline.js` - Saving throw resolution with exhaustion, conditions, and cover
  - `resolve-attack-pipeline.js` - Attack roll and damage resolution with critical hits and fumbles
- **Comprehensive Documentation:** Updated `ARCHITECTURE-ROLLS.md` with complete schema-driven system design and implementation details

### Changed
- **Download URL Pattern:** Changed download URL from version-specific (`v12.1.0/module.zip`) to latest release pattern (`latest/coffee-pub-blacksmith.zip`), eliminating the need for manual URL updates before each release.
- **Release Workflow:** Updated GitHub Actions workflow to use module-specific zip naming and file references.
- **Roll Window Integration:** Updated roll window to use unified header template and pass actor portrait data
- **Formula Display Logic:** Enhanced formula display to show ability-specific modifiers instead of hardcoded "dex"
- **Custom Modifier Processing:** Improved custom modifier parsing to handle multiple values and prevent double plus signs
- **Roll Title Handling:** Fixed roll title passing from skill check dialog to roll window and chat cards
- **Template Structure:** Updated skill check and roll window templates to use consistent header layout and styling
- **Roll Calculation Accuracy:** Enhanced roll calculations to ensure 100% accuracy between displayed formula and actual roll execution

### Fixed
- **Manual Release Process:** Eliminated the requirement to manually update the download URL in `module.json` before each release. The `latest` tag now automatically redirects to the most recent release.
- **Hardcoded Ability References:** Fixed formula display to use dynamic ability keys instead of hardcoded "dex"
- **Custom Modifier Parsing:** Fixed double plus signs in custom modifier tooltips and formula display
- **Proficiency Calculation:** Fixed ability rolls to properly include proficiency bonus when character is proficient
- **Roll Title Consistency:** Fixed roll title display across skill check dialog, roll window, and chat cards
- **Chat Card Ownership:** Fixed ownership-based button functionality in chat cards
- **Template Rendering:** Fixed partial template loading errors and missing data passing
- **Math Accuracy:** Fixed roll calculation discrepancies between displayed formula and actual roll execution
- **Group Roll Logic:** Fixed group roll evaluation to properly honor the Group DC toggle setting
- **Roll Mode Processing:** Fixed roll mode selection to be properly passed through to roll execution

### Technical Details
- Implemented component-based roll evaluation system for accurate D&D 5e rule compliance
- Added feature detection from actor items and active effects for proficiency resolution
- Created caching system for rules and feature indexes to improve performance
- Enhanced error handling and validation throughout the roll system
- Improved socket communication for roll mode visibility and ownership controls
- Added comprehensive logging and debugging capabilities for roll system troubleshooting

## [12.0.23] - Suppress Combat Deployment from Players

### Fixed
- **Player Deployment Panel Access:** Fixed issue where the deployment panel (CODEX) was visible to players in journal entries. The entire deployment interface is now restricted to GMs only.
- **Deployment Panel Security:** Wrapped the complete deployment section in GM permission checks, preventing players from seeing:
  - DEPLOY section with deployment pattern and visibility settings
  - "Nothing to Deploy" messages
  - Deployment action buttons and monster/NPC icons
  - Deployment controls and settings
- **Canvas Information Visibility:** Maintained visibility of canvas information (Party CR, Monster CR, encounter difficulty) for all users while restricting deployment functionality to GMs only.

### Changed
- **Template Structure:** Restructured `encounter-toolbar.hbs` template to wrap the entire deployment interface in `{{#if isGM}}` conditional blocks.
- **Permission Enforcement:** Consolidated individual GM permission checks into comprehensive section-level protection for better security and maintainability.

## [12.0.22] - Quick Fix

### Fixed
- **Manifest:** Corrected the manifest download.

## [12.0.21] - Token Grid Positioning Fix

### Fixed
- **Token Grid Positioning:** Fixed token deployment to properly snap to grid square positions instead of grid intersections. All deployment patterns (line, circle, scatter, grid, sequential) now correctly place tokens within grid squares using the proper FoundryVTT coordinate system.

### Changed
- **Skill Roll Routing (DnD5e 4.4.4):** Updated skill check execution to use the DnD5e Actions API first (`game.dnd5e.actions.rollSkill`), with safe fallbacks to `rollSkillV2` and `doRollSkill`, and legacy `rollSkill` only as a last resort. This ensures v2 paths are used on 4.4.4 and prepares for removal of deprecated hooks in 5.0.

### Compatibility
- **Deprecation Warning Mitigation:** On DnD5e 4.4.4, skill checks now route through the v2 API to avoid triggering the deprecated `dnd5e.rollSkill` hook warning.

## [12.0.20] - Encounter Toolbar and Token Deployment

### NOTE: Bumped the version to 12 to align with the Foundry version.

### Added
- **Encounter Folder Support:** Added support for placing deployed actors in a configurable folder. When the `encounterFolder` setting is specified, actors are automatically placed in that folder. If the folder doesn't exist, it's created automatically. If the setting is empty, actors are placed in the root directory.
- **Enhanced Token Deployment Patterns:** Implemented multiple deployment patterns for encounter tokens:
  - **Circle Formation:** Tokens are placed in a circle around the deployment point
  - **Scatter Positioning:** Tokens are scattered in a spiral pattern to prevent overlaps with random variation
  - **Grid Positioning:** Tokens are placed in a proper square grid formation using scene grid size
  - **Sequential Positioning:** Tokens are placed one at a time with user guidance via tooltip
  - **Line Formation:** Default fallback pattern for backward compatibility
- **Unlinked Token Creation:** Deployed tokens are now created as unlinked copies instead of linked tokens, providing better flexibility for individual token management.
- **Lock Rotation Support:** Deployed tokens now honor the GM's default token rotation settings from Foundry core settings.
- **CR Badge System:** Added Party CR and Monster CR badges to the encounter toolbar:
  - **Party CR:** Calculates weighted party level using tiered formula (levels 1-4: 0.25x, 5-10: 0.5x, 11-16: 0.75x, 17-20: 1x)
  - **Monster CR:** Shows total CR of monsters currently deployed on the canvas
  - **Difficulty Badge:** Displays encounter difficulty with proper color coding
- **Encounter Template Import:** Added "Encounter" option to the JSON import dropdown, allowing users to copy encounter templates from `prompt-encounter.txt` for easy encounter creation.
- **Content Scanning:** Enhanced encounter detection to scan journal content for encounter data in JSON, markdown, and plain text formats when structured data attributes are not found.
- **Foundry UUID Support:** Updated content scanning to properly parse Foundry's @UUID[...]{...} format for monster references in journal entries.
- **Monster Name Resolution:** Added support for monster names in templates (e.g., "Death Knight", "Helmed Horror") with automatic lookup in available compendiums during deployment.
- **Pattern-Based Detection:** Completely redesigned encounter detection to use robust pattern matching instead of section-based parsing. Now detects @UUID patterns anywhere on the page, validates Actor types, and supports quantity indicators (x3, (3), etc.).
- **Journal Type Identification:** Maintains support for `data-journal-type="encounter"` as a quick identifier while ignoring deprecated `data-encounter-monsters` and `data-encounter-difficulty` attributes in favor of content scanning.
- **Monster Portraits:** Added monster portraits to the encounter toolbar instead of generic dragon icons, showing actual monster images with proper CR values.
- **Enhanced Retry Mechanism:** Improved content scanning reliability with multiple retry attempts (500ms, 1000ms, 2000ms) to handle timing issues when journal content loads after toolbar initialization.
- **Real-Time CR Updates:** Added real-time CR calculation updates when tokens are created, updated, or deleted on the canvas. CR badges now update automatically without requiring journal refresh.
- **Individual Token Deployment:** Added ability to deploy individual monsters and NPCs by clicking on their icons in the toolbar. Supports both single deployment and CTRL-click for multiple placement.
- **Multi-Placement Support:** Implemented CTRL key functionality for placing multiple instances of single tokens. Hold CTRL while clicking to place multiple copies, release CTRL to finish.
- **Invisible Token Deployment:** Added ALT key functionality to deploy tokens as invisible. Hold ALT while deploying to create hidden tokens for surprise encounters.
- **Token Visibility Toggle:** Added "Reveal Monsters" button to make hidden hostile NPC tokens visible on the canvas.
- **NPC and Monster Separation:** Separated NPCs and monsters into distinct sections in the toolbar display, with proper classification based on compendium source and disposition.
- **Deployment Cancellation:** Added right-click to cancel deployment during placement, with proper cleanup of event handlers and tooltips.
- **Partial Deployment Handling:** Added dialog prompt when combat creation is cancelled mid-deployment, allowing users to choose whether to create combat with partially deployed tokens.

### Fixed
- **Token Display Name Settings:** Fixed deployed tokens to honor the GM's core token display settings instead of prototype token settings. Tokens now properly use the GM's default name display mode (e.g., "anyone on hover" vs "never").
- **Actor Prototype Token Updates:** Fixed actor prototype tokens to be updated with GM's default settings when created from compendiums, ensuring subsequent drags from the actor tab also honor GM defaults.
- **Scatter Pattern Overlaps:** Fixed scatter deployment pattern to prevent token overlaps by using a spiral-based distribution with adequate spacing.
- **Grid Formation Issues:** Fixed grid deployment pattern to create proper square formations instead of single lines, using actual scene grid size for positioning.
- **Memory Leaks:** Fixed memory leaks in event handlers and socket communications to improve performance and prevent memory accumulation over time.
- **Debug Logging:** Optimized debug logging to reduce console noise and improve performance by using proper logging levels and conditional debugging.
- **Combat Token Addition:** Fixed issue where deployed tokens were not being added to combat encounters. Now properly tracks deployed tokens and adds them to existing or new combat encounters.
- **Double Deployment Issue:** Fixed issue where clicking "create-combat" button would deploy tokens twice. Consolidated deployment logic into single function used by both buttons.
- **Spell DC Deprecation Warning:** Updated CR calculation to use new DnD5e 4.3+ spell DC property path (`attributes.spell.dc`) with backward compatibility.
- **Encounter Template Placeholders:** Fixed encounter template copying to replace placeholders with settings values (campaign name, party details, etc.) like narratives do.
- **Encounter Settings:** Added new encounter default settings for folder and card image configuration.
- **Compendium Search Expansion:** Updated compendium search functions to support up to 8 monster and item compendiums (increased from 5).
- **Difficulty Badge Alignment:** Fixed "MEDIUM" difficulty badge to be left-aligned with the title instead of centered.
- **Party CR and Monster CR Display:** Ensured Party CR and Monster CR are always calculated and displayed, even when no explicit encounter data is found in the journal.
- **Permission Errors:** Fixed permission errors when players try to use features that require token updates (deployment, combat creation, token conversion, movement, token renaming). Added proper GM-only permission checks.
- **Multiple Journal Windows:** Fixed issue where having multiple journal windows open would cause multiple deployments and combat creations when clicking buttons. Event listeners are now properly scoped to individual toolbars.
- **Broken Monster Links:** Added logic to skip broken monster links (e.g., `class="content-link broken"`) during encounter detection.
- **CR Values Display:** Fixed CR values to display correct values instead of all 0s by implementing robust CR extraction from multiple actor system paths.
- **CR Badge Icon Removal:** Fixed issue where CR badge icons were being removed when updating CR values. Now preserves icons during updates.
- **ESC Key Cancellation:** Fixed ESC key functionality to properly cancel deployment without causing errors. Replaced with right-click cancellation for better user experience.
- **Sequential Deployment Cancellation:** Fixed error when cancelling sequential deployment that would cause "Cannot read properties of null" error. Added proper null checks for cancelled deployments.
- **Token Linking Honor:** Fixed hardcoded `actorLink = false` to honor the original actor's prototype token linked setting during deployment.
- **NPC Deployment Issues:** Fixed NPCs not being deployed and appearing in monster sections. Added proper NPC/monster classification and separate deployment handling.
- **Index Mismatch Errors:** Fixed issue where clicking on one monster icon would deploy a different monster due to DOM index mismatches. Now uses UUID-based identification.
- **UUID Validation:** Fixed UUID validation to properly handle world actors (non-compendium actors) during deployment.

### Changed
- **Deployment Pattern Setting:** Added `encounterToolbarDeploymentPattern` setting with options for circle, line, scatter, grid, and sequential positioning.
- **Deployment Hidden Setting:** Added `encounterToolbarDeploymentHidden` setting to control whether deployed tokens are hidden by default.
- **Real-Time Update Setting:** Added `enableEncounterToolbarRealTimeUpdates` setting to control whether CR badges update automatically when tokens change on the canvas.
- **Improved Token Positioning:** All deployment patterns now properly snap to the scene grid and use appropriate spacing based on grid size.
- **Enhanced Error Handling:** Added comprehensive error handling for folder creation and actor placement operations.
- **Toolbar Layout:** Redesigned encounter toolbar with title above buttons and badges, improved badge positioning and styling. Moved difficulty badge to canvas section for better organization.
- **Combat Creation Flow:** Updated "create-combat" button to deploy tokens first, then create combat with those tokens, ensuring proper token tracking.
- **Event Listener Scoping:** Updated event listeners to be properly scoped to individual toolbar containers, preventing cross-contamination between multiple journal windows.
- **Permission-Based UI:** Updated toolbar template to only show deployment and combat buttons for GMs, while still displaying monster icons and CR information to all users.
- **Deployment Controls:** Updated deployment controls to support CTRL for multiple placement and ALT for invisible deployment. Tooltips now show key combinations for user guidance.
- **Cancellation Method:** Changed deployment cancellation from ESC key to right-click to prevent interference with other open windows and dialogs.

### Technical Details
- Implemented proper merging of GM's `defaultToken` settings with actor prototype tokens using `foundry.utils.mergeObject`
- Added grid-aware positioning using `canvas.scene.grid.size` for accurate token placement
- Enhanced spiral-based scatter algorithm with random variation for natural-looking distributions
- Improved folder management with automatic creation and error recovery
- Added weighted party CR calculation using tiered level brackets for realistic encounter scaling
- Implemented canvas-based monster CR calculation for real-time encounter difficulty assessment
- Added permission checks to all token update operations: `_deployMonsters()`, `_createCombatWithTokens()`, `_createCombat()`, `_convertTokenToLoot()`, `_onCreateToken()`, `processNextFollower()`, `moveAllTokensOneStep()`
- Implemented proper event listener scoping using `toolbar.find()` instead of `$(document).find()` to prevent multiple journal window conflicts
- Added robust CR extraction from multiple actor system paths: `actor.system.details.cr.value`, `actor.system.details.cr`, `actor.system.cr`
- Enhanced content scanning with multiple fallback selectors and document-wide search for better reliability
- Implemented real-time CR updates using FoundryVTT hooks: `createToken`, `updateToken`, `deleteToken`, `settingChange`
- Added debouncing mechanism for CR updates to prevent performance issues during rapid token changes
- Implemented NPC/monster classification using heuristic-based logic (compendium source and disposition)
- Enhanced token deployment with key state detection (CTRL, ALT) and proper event handling for multiple placement modes
- Added UUID-based token identification to prevent DOM index mismatches during individual deployment
- Implemented proper token linking honor by preserving original actor's `prototypeToken.actorLink` setting

## [1.0.19] - Item Import and UI Improvements

### Added
- **Item Image Terms Array:** Added `itemImageTerms` array to item JSON for explicit control over image matching during imports, allowing precise synonym specification for image selection.
- **API Exposure:** Exposed `arrCOMPENDIUMCHOICES` in the Blacksmith API for other modules to access available compendium choices.

### Fixed
- **Item Import Logic:** Fixed image guessing logic to properly prioritize exact and partial synonym matches in item names first, then in descriptions, followed by loot type, filename, and fallback options.
- **Compendium Links:** Fixed compendium links during import to use UUIDs instead of simple references, ensuring links remain valid after import.
- **UI Underline Effects:** Removed underline effects and associated code from UI elements, relying on mouse pointer changes as sufficient visual cues.

### Changed
- **Image Matching Priority:** Improved item image matching to check `itemImageTerms` array first, then follow a clear hierarchy: item name exact/partial matches → description matches → loot type → filename → fallback options.

## [1.0.18] - Multiple Token Bug Fix

### Fixed
- **Token Name Display:** Skill check dialog and chat cards now use the token's name (e.g., "Sinolax (Troll)") instead of the actor's name (e.g., "Troll") for all contestant and result displays, making it easier to distinguish between multiple tokens of the same actor.
- **Multiple Token Roll Support:** Chat card roll buttons now correctly support rolling for multiple tokens of the same actor by matching both tokenId and actorId, ensuring each token instance is handled independently.
- **Improved User Clarity:** All skill check UI and chat card displays now reflect the actual token name, improving clarity for GMs and players when multiple similar tokens are present.
- **Token ID System:** Completely refactored skill check system to use token IDs instead of actor IDs for unique identification
- **Chat Card Roll Buttons:** Updated chat card roll buttons to work with individual token instances
- **Permission Handling:** Fixed permission checks to allow GMs to roll for any token while maintaining proper ownership checks for players
- **Actor Lookup:** Improved actor lookup logic with better error handling and debugging for token-to-actor resolution

### Changed
- **Data Structure:** Updated skill check message data to store both token ID (for unique identification) and actor ID (for roll operations)
- **Template Attributes:** Changed data attributes from `data-actor-id` to `data-token-id` for clarity
- **Socket Communication:** Updated socket handlers to work with token IDs for proper multi-token support

### Technical Details
- Changed `getData()` method to use `t.id` (token ID) instead of `t.actor.id` (actor ID)
- Updated all JavaScript methods to handle token ID to actor ID resolution
- Fixed chat card template to store both token and actor IDs
- Improved error handling for cases where tokens or actors might not be found

## [1.0.17] - Experience Points

### Added
- **XP Distribution Chat Card:** Introduced a new, visually distinct chat card to display XP distribution results, separate from the main XP window.
- **Dedicated CSS for XP Card:** Created a new stylesheet (`cards-xp.css`) and namespaced all classes to ensure consistent styling and prevent conflicts.

### Changed
- **XP Chat Card Layout:** Completely redesigned the chat card for improved clarity and aesthetics:
  - The **XP Summary** section now uses a clean, two-column layout.
  - The **Player Results** section has been updated to feature the character portrait, name, and new total XP on the left, with the XP gained aligned to the right.
  - The **Monster Resolutions** section now aligns all monster names and icons for a tidier list, with XP values aligned to the right.
- **Improved Data Formatting:** XP multipliers are now consistently formatted to two decimal places (e.g., 1.00) on all displays.

### Removed
- **Removed CR from Chat Card:** The monster Challenge Rating is no longer displayed on the XP chat card to reduce clutter.
- **Removed Legend from Chat Card:** The resolution types legend was removed from the chat card for a more streamlined look.

## [1.0.16] - Compendiums

### Added
- **Enhanced Compendium Mapping System**
  - Added support for up to 5 monster lookup compendiums (replacing the old primary/secondary system)
  - Added support for up to 5 item lookup compendiums
  - Added "Search World Items First" setting to prioritize world items over compendium items
  - Added automatic item linking in narrative JSON imports (similar to monster linking)
  - Added fuzzy matching for item names with exact match priority

### Changed
- **Improved Compendium Labels**
  - Updated compendium dropdown labels to show source and name (e.g., "Dungeons & Dragons 5th Edition: Actors")
  - Enhanced clarity when multiple compendiums share the same name
- **Enhanced Item Linking**
  - Items in rewards and other narrative fields are now automatically linked to compendium entries
  - Item linking follows the same priority system as monster linking (world first, then compendiums 1-5)
  - Improved item name matching with exact match priority over partial matches

### Fixed
- Removed legacy monster compendium primary/secondary settings
- Cleaned up unlinked item/monster display by removing "(Link Manually)" suffix
- Fixed item name matching to handle variations like "Bedroll (used for sleeping)" matching "Bedroll"

### Removed
- Removed old `monsterCompendiumPrimary` and `monsterCompendiumSecondary` settings
- Removed legacy compendium lookup code

## [1.0.15] - Optimizations

### Fixed
- Group roll summary (success/failure) now displays correctly after all players or the GM have rolled, regardless of who initiates the roll.
- Fixed issue where GM-initiated rolls did not update the chat card for all users.
- Prevented ReferenceError when requesting rolls (no roll performed yet).
- Fixed error when roll is not defined in the roll handler.
- Improved error handling and guard clauses to prevent undefined roll errors in all roll scenarios.

### Changed
- Updated all skill roll logic to use `rollSkillV2` if available, with fallback to `rollSkill` for backward compatibility with older DnD5e versions.
- Added robust compatibility checks for DnD5e 4.1+ and future 4.5+ removal of deprecated methods.
- Refactored socket and chat update logic for unified handling of both player and GM rolls.
- Improved code clarity and maintainability in skill check dialog and group roll logic.

### Compatibility
- Fully compatible with DnD5e 4.1+ and future-proofed for 4.5+ removal of deprecated APIs.
- No longer triggers deprecation warnings for skill rolls.

## [1.0.14] - 2025-04-28 - Excluded Users and Character Leadership

### Added
- Implemented character-based leadership system
- Added character name display in leader selection
- Updated movement system to follow character tokens
- Added player name display alongside character names

### Fixed
- Fixed excluded users appearing in leader selection dialog
- Fixed excluded users appearing in character vote options when using "Current Players" source
- Improved consistency of user exclusion across all voting and leader selection interfaces

### Changed
- Refactored skill check dialog and skill selection logic for improved reliability and maintainability
- Updated skill check integration to support direct result passing and input field updates
- Improved UI hiding logic for skill check and movement panels to reduce clutter when not in use
- Refactored and improved code for token following and conga line movement, ensuring smoother and more consistent pathing

## [1.0.13] - 2025-04-22 - Movement AND CLEANUP

### Added
- **Enhanced Movement System**
  - Added proper path management for conga line movement
  - Added token spacing configuration
  - Added status tracking for tokens (Normal, Blocked, Too Far)
  - Added visual indicators for token status in marching order
  - Added automatic exclusion of blocked or too-far tokens from movement

### Changed
- **Movement Improvements**
  - Improved path following behavior for tokens
  - Enhanced marching order calculation
  - Optimized path trimming logic
  - Better handling of token spacing in formation

### Fixed
- Fixed tokens stacking on top of each other during movement
- Fixed marching order recalculation issues
- Fixed path following to maintain proper spacing
- Fixed tokens skipping path points during movement
- Fixed blocked and too-far tokens attempting to join formation
- Fixed conga line movement bugs causing tokens to stack or lose formation
- Fixed follow mode issues where tokens would not properly follow the leader or would desync
- Fixed skill check dialog not updating input fields after roll
- Fixed UI elements not hiding correctly when toggled or when not relevant to the current mode

## [1.0.12] - 2025-03-25 - Rolls and Movement Controls

### Added
- **Skill Check System**
  - New skill check dialog for quick party-wide rolls
  - Support for contested rolls between groups
  - Customizable DC display and success/failure indicators
  - Quick roll context menu for common skill checks
  - Detailed roll results with formula display
  - Group success tracking for multiple participants
  - Skill descriptions and rule references

- **Movement Controls**
  - New movement configuration dialog
  - Multiple movement modes:
    - Normal movement
    - No movement
    - Combat movement
    - Follow movement
    - Conga line movement
  - Visual indicators for current movement mode
  - GM-only movement mode control
  - Persistent movement settings

- **Chat Card Improvements**
  - Enhanced skill check card layout
  - Better visual hierarchy for roll results
  - Improved success/failure indicators
  - Detailed roll information tooltips
  - Group vs group contest visualization
  - Stalemate detection and display
  - Party-wide roll success tracking

- **UI Enhancements**
  - New movement control icon in menubar
  - Quick access to skill check dialog
  - Improved chat card spacing and margins
  - Better visual feedback for roll results
  - Enhanced tooltips and information display
  - Streamlined interface for GM controls

### Changed
- Updated menubar layout to accommodate new features
- Improved error handling for settings access
- Enhanced leader selection interface
- Better synchronization of movement states
- Optimized performance for multiple simultaneous rolls

### Fixed
- Settings access error handling
- Leader selection synchronization
- Movement state persistence
- Chat card rendering issues
- Roll result calculation accuracy

## [1.0.11] - 2025-03-25 - GM Tools added

### Added
- CSS Editor for GMs to customize Foundry's appearance
  - Accessible via toolbar button
  - Live preview of CSS changes
  - Dark/Light mode toggle for editor
  - Smart indentation support
  - Copy, clear, and refresh buttons
  - Quick access to World Config and Settings
  - Smooth transition effects option
  - Changes sync to all connected clients
  - Dark themed window with light/dark editor modes
  - Proper handling of NPC type selection in Assistant panel
- Added refresh browser button to GM toolbar for quick page reloads
- Added visual character selection for skill check rolls
  - Card-based interface showing character portraits and details
  - Shows character level, class, and current HP
  - Visual selection state with hover effects
  - Only shows characters present on the canvas
  - Matches the visual style of other character cards in the system

### Fixed
- Fixed NPC type selection in Assistant panel to properly identify friendly NPCs
- Fixed CSS Editor window styling and content overflow issues
- Fixed minimum width handling in CSS Editor window
- Fixed dice roll button placement in global skill check rolls section
- Fixed drop zone styling and text in Assistant panel
- Fixed skill check roll dialog to use proper character selection UI

### Changed
- Moved dice roll functionality from Assistant criteria to global skill check rolls
- Improved drop zone UI with clearer instructions and visual feedback
- Enhanced skill check character selection with visual card-based interface
- Streamlined character selection process for skill checks

## [1.0.10] - 2025-03-25 - AI Tools

### Added
- Added character guidance into the AI tools
- Added Skillcheck lookups for monsters, items etc.  based on the selected character

### Fixed
- Fixed weapon display in character panel to properly show equipped weapons
- Simplified weapon display layout for better readability
- Fixed weapon data access in template to correctly show weapon properties
- Restored AI prompt functionality that was accidentally broken in previous update

### Changed
- Streamlined weapon display to show name and info next to image
- Simplified text colors to use default panel text colors
- Improved weapon information layout for better clarity

## [1.0.9] - Combat Tracker Enhancements

### Added
- Added visual feedback animation when dropping combatants in the initiative order
- Added improved drag and drop functionality in combat tracker
- Added visual indicators for drop zones between combatants
- Added "Roll Remaining" button to roll initiative for combatants without initiative
- Added option to automatically set first combatant when all initiatives are rolled
- Added automatic initiative rolling options:
  - Auto-roll for NPCs/monsters when added to combat
  - Auto-roll for player characters (configurable per user)
  - Auto-roll for remaining NPCs at round start

### Changed
- Enhanced cursor feedback during drag operations
- Improved spacing and visual feedback during drag and drop operations
- Updated drop target styling for better visibility
- Refactored combat tracker code for better maintainability and performance
- Enhanced initiative handling with more configuration options
- Improved mid-combat combatant addition with multiple initiative modes:
  - Auto-roll initiative
  - Set to act next
  - Add to end of round

### Fixed
- Fixed cursor styles not updating during drag operations
- Fixed initiative handling when adding new combatants mid-combat

## [1.0.8] - Encounter Toolbar

### Added
- Added Encounter Toolbar for journal entries with encounter metadata
- Added monster deployment functionality with multiple formation patterns (circle, line, random)
- Added combat creation and initiative rolling directly from journal entries
- Added encounter difficulty visualization in toolbar
- Added settings to control encounter toolbar behavior:
  - Enable/disable encounter toolbar
  - Auto-create combat after monster deployment
  - Configure monster deployment pattern

### Changed
- Improved metadata handling in journal entries
- Updated journal rendering hook to detect encounter journal entries

## [1.0.7] - Combat Timer Improvements

### Added
- Added token targeting detection to automatically start the combat timer
- Added more robust round change detection using a custom tracking variable
- Added detailed logging for better debugging of timer behavior
- Added drag and drop functionality for initiative in the combat tracker
- Added health bars to combat tracker tokens
- Added option to show portraits in combat tracker
- Added "Set as current combatant" button to combat tracker

### Changed
- Improved the interaction between Combat Timer and Planning Timer
  - Replaced direct API access with Hook-based communication
  - Simplified code structure for better maintainability
- Enhanced round change detection to prevent timer issues during round transitions
- Updated token movement detection for better compatibility with Foundry VTT v12

### Fixed
- Fixed issue with combat timer continuing to run during round changes
- Fixed multiple timer activations when round changes occur
- Fixed planning timer cleanup when transitioning between rounds
- Fixed round timer to pause when the session is not running

## [1.0.6] - Chat Message Improvements

### Added
- Added new settings for chat message control
  - Toggle for GM-only timer notifications
  - Configurable message visibility options
- Enhanced chat message handling for timers and notifications

### Changed
- Updated chat message system to respect GM-only settings
- Improved message handling for better user experience
- Fixed JSON formatting issues in chat responses

## [1.0.5] - Network Monitoring and Settings

### Added
- Added real-time latency monitoring system
  - Color-coded latency display next to player names
  - Configurable latency check frequency (5s to 5min)
  - Enable/disable latency display option
  - Automatic local GM detection for accurate readings
- Added new settings for latency monitoring
  - Toggle for enabling/disabling latency display
  - Slider for adjusting check frequency

### Changed
- Updated settings organization for better clarity
- Improved latency threshold values for more accurate status indication
- Enhanced socket message handling for better network communication

### Removed
- Removed the redundant dashboard now that we have the Squire module 

## [1.0.4] - Vote System and UI Improvements

### Added
- Added clickable vote tool area in menubar
- Added improved styling for vote section to match other UI elements

### Changed
- Updated vote tool UI to be more consistent with other elements
- Improved vote label alignment and styling
- Enhanced hover effects for vote controls

## [1.0.3] - UI Improvements and Bug Fixes

### Added
- Added quality of life aesthetic improvements
- Enhanced UI elements for better user experience

### Changed
- Updated module version to 1.0.3
- Improved overall visual consistency

## [1.0.2] - Cleanup and Refactor

### Added
- Added a new class for generating MVP descriptions based on combat stats.
- Added a new class for generating combat history.
- Added session timer date tracking to persist timer state between sessions
- Added ability to set current timer duration as the new default
- Added seconds display to session timer
- Added proper permission checks for vote initiation by party leader
- Added visual feedback for completed votes with checkmark icon

### Changed
- Moved MVPTemplates from mvp-templates.js into assets.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into stats-combat.js
- Consolidated combat-related functionality into fewer files for better maintainability
- Modified session timer to use the default time when loading on a new day
- Updated timer dialog to include option for saving current duration as default
- Updated vote system to properly handle leader permissions
- Improved vote UI with better status indicators and button states

### Removed
- Removed unused debug.js file
- Removed mvp-templates.js after moving its contents
- Removed mvp-description-generator.js after moving its contents

## [1.0.1] - It's All About Timers

### Added
- Automated release workflow using GitHub Actions
  - Automatic ZIP file creation for releases
  - Automated release creation on new version tags
  - Release notes generation

### Fixed
- Fixed timer expiration messages being sent repeatedly
- Fixed "time is running out" warning messages being sent multiple times
- Fixed planning timer synchronization between GM and players
- Fixed timer cleanup and fadeout behavior for non-GM users
- Fixed permission issues with chat messages for non-GM users
- Improved timer state management and UI updates

### Changed
- Refactored timer code to use socketlib for better client synchronization
- Updated planning timer to match combat timer's behavior
- Improved timer expiration handling for consistency across all timer types

## [1.0.0] - 2025-01-22 - Initial Release

### Added
- Combat Statistics System
  - Core combat statistics tracking
  - Round-by-round tracking with summary display
  - MVP system with card-based stat display
  - Notable moments tracking with party focus
  - Party breakdown with individual performance stats
  - Combat session stats with accuracy tracking
  - Combat statistics chat output
- Combat Management
  - Combat timer with pause/resume functionality
  - Planning timer with strategic phase support
  - Turn tracking system with accurate timing
- UI Enhancements
  - Combat dashboard with real-time statistics
  - Visual progress indicators and timers
  - Multiple visual themes
  - Player portraits with rank overlays
  - Icons for critical hits and fumbles
  - Consistent header styling
- Full documentation and README
- FoundryVTT v12 compatibility

### Changed
- Updated Notable Moments section title to "Notable Party Moments"
- Ensured chat messages come from GM instead of selected token

### Fixed
- Fixed MVP player name formatting
- Adjusted fumble icon color for better visibility
