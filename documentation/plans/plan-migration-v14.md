# Migrating modules from Foundry VTT v13 → v14

**Status: Planned — the v14 move has not started.** Live scaffolding; extend it as you discover edge cases.
This is deliberately written for **any** Coffee Pub module, not just Blacksmith, so the whole suite learns
the same lessons once. It lives here because Blacksmith is the hub — same reason as `TODO-GLOBAL.md`.

**On completion:** the durable lessons fold into the relevant module's architecture docs, the work items
become TODOs, and this file is deleted. It is not an archive.

This document collects **official sources**, **notable breaking changes**, a **practical migration workflow**, and **project-specific notes** for Coffee Pub Blacksmith.

---

## MEASURED FINDINGS — read this before auditing anything

**Everything in this section was measured on a live Foundry 14.367 / dnd5e 5.3.3 client on 2026-09-09**,
during the suite-wide migration, by driving the client over the Chrome DevTools Protocol. It supersedes
the speculative sections below, which were written before anyone had run v14. Eleven module sessions asked
the same four questions; this is the answer, so read it rather than asking the hub to retype it.

### The rulings (manifest, badge, pin)

- **`compatibility: {minimum: "13", verified: "14", maximum: "14"}`** — the author's words: **"until 13
  breaks."** v13 is not being dropped.
- **Pin `coffee-pub-blacksmith` at `>= 14.1.0`.** Honourable alongside `minimum: "13"`, because Blacksmith
  14.1.0 itself declares `minimum: "13"` — a v13 world runs both.
- **Versions:** each module bumps its own line. A satellite's first v14 release is `14.0.0`.
- **README badge — two badges, not one**, after downloads and before the licence badge:

      ![Foundry v13](https://img.shields.io/badge/foundry-v13-yellow)
      ![Foundry v14](https://img.shields.io/badge/foundry-v14-green)

  **Yellow = supported, green = verified.** The green badge is a verification claim in a place people read,
  so it lands in the **same commit** that sets `verified: "14"` — never before. A single combined
  `v13 | v14` badge is wrong: it cannot say which generation is verified. Licence badge is
  `license-MIT-blue`.

### What v14 actually removed — and what it did NOT

**The premise that cost the suite hours was "v14 removes the un-namespaced globals". It does not.** Probing
187 globals found **55 removed**:

| Family | Names |
|---|---|
| `foundry.utils` aliases (32) | `mergeObject duplicate deepClone diffObject flattenObject expandObject filterObject getType setProperty getProperty hasProperty invertObject randomID isNewerVersion benchmark timeSince formatFileSize parseS3URL getRoute fetchWithTimeout fetchJsonWithTimeout debounce throttle deepFreeze escapeHTML logCompatibilityWarning isEmpty encodeURL Semaphore StringTree WordTree BitMask` |
| `foundry.audio` (3) | `AudioHelper Sound AudioContainer` |
| dice terms (12) | `Die DiceTerm NumericTerm OperatorTerm PoolTerm ParentheticalTerm StringTerm FunctionTerm RollTerm Coin FateDie MersenneTwister` — **`Roll` itself survives**, which makes this family easy to miss |
| sidebar/apps (7) | `DocumentDirectory SidebarTab SidebarDirectory PlayerList PermissionConfig WorldConfig HeadsUpDisplay` |
| other (1) | `TextureUtils` |

**Only the BARE ALIASES are gone. The `foundry.utils` NAMESPACE is alive** — `foundry.utils.mergeObject`
and friends all work. This sentence has been misread once; it matters, because the two readings have
opposite consequences.

**Still present and working:** `CONST`, `Dialog`, `Application`, `FormApplication`, `DocumentSheet`,
`ActorSheet`, `ItemSheet`, `JournalSheet`, `FilePicker`, `TextEditor`, `ContextMenu`, `DragDrop`, `Tabs`,
`SearchFilter`, `Roll`, `Canvas`, every document class, `saveDataToFile`, `readTextFromFile`, `srcExists`,
`Color`, `Collection`. 132 of 187 resolve.

`blacksmithLegacyGlobals()` prints the live table and warns when a **newer** generation removes something
14.367 still had.

### The three failure modes that actually bit modules

**1. A hook named after a renamed Application class registers successfully and never fires.** No error, no
warning, the feature silently does nothing. This caught five modules:

| Dead name | Live name | Module |
|---|---|---|
| `renderJournalSheet` | `renderJournalEntrySheet` | Blacksmith (3 files), Herald, Scribe |
| `renderJournalPageSheet` | `renderJournalEntryPageSheet` | same |
| `renderActorSheet5e` | `renderActorSheetV2` | Squire |
| `renderItemSheet` | `renderDocumentSheetV2` | Artificer |
| `renderDialog` | `renderDependencyResolution` | Monarch |

`HookManager.LEGACY_HOOKS` auto-remaps the known ones and warns naming the caller; `blacksmithSilentHooks()`
lists registered names that have not fired. **Prefer core's system-agnostic hook over a system-specific
one** — `renderDocumentSheetV2` filtered on `app.document.documentName` beats `renderItemSheet5e`, which
dnd5e can rename again.

**Watch for double-registration:** a module holding both a legacy name and its modern equivalent gets two
live callbacks once the remap lands. Herald was double-emitting a socket message per journal open.

**2. CSS reaching into core DOM fails silently.** v14 moved several elements from classes to IDs, and
restructured DialogV2:

| Dead | Live |
|---|---|
| `#interface > section.ui-left` (and `-middle`, `-right`) | `section#ui-left` etc. |
| `#combat-tracker` | `ol.combat-tracker` inside `section#combat` |
| `#roll-privacy` | gone; `#chat-controls` holds `div#message-modes.split-button` |
| `.dialog-buttons` | `footer.form-footer` |
| `.dialog-button` / `[data-button="x"]` | plain `button` with `[data-action="x"]` |
| `canvas.background` | never existed on any version — the background is a PIXI mesh |
| `.editor-toolbar` | no match on 14.367 |

Surviving: `#combat-popout`, `#interface`, `#notifications`, `#ui-left` (as an **ID**), `.dialog-content`,
`prose-mirror`, `.editor-container`, `.editor-menu`, `.editor-content`, **both** `.ProseMirror` and
`.prosemirror` (same element), `.form-group`, `.application`.

`.dialog` is present on the `<dialog>` root but **not dependably selectable while open as a modal** — scope
from `.application` instead.

**When fixing these, match BOTH structures rather than swapping** — `minimum: "13"` means the old selector
is not hypothetical. Librarian's pattern: `:is(.dialog-buttons, .form-footer) :is(.dialog-button, button)`.

**3. A property removed from a global that survives.** `CONST.CHAT_MESSAGE_TYPES` is gone while bare
`CONST` lives, so **no removed-globals scan catches it**. Use `CONST.CHAT_MESSAGE_STYLES`
(`{OTHER:0, OOC:1, IC:2, EMOTE:3}`). **Grep your own `CONST.*` reads and confirm each property.** An
unguarded read throws; a guarded one degrades to a literal that may be silently wrong.

### Confirmed unchanged — do not spend time on these

**Font Awesome 7 is a non-issue.** Legacy `fas` / `far` / `fab` aliases all resolve, and every unusual
glyph tested rendered (`fa-chart-network`, `fa-wagon-covered`, `fa-wheat-awn`, `fa-sack-xmark`,
`fa-feather-pointed`, `fa-store-slash`, `fa-beer-mug-empty`, `fa-book-atlas`, `fa-user-group-simple`,
`fa-crow`, `fa-hand-holding-heart`). Zero blanks. Family resolves as "Font Awesome 7 Pro".

PIXI **7.4.3**, `canvas.app.stage/renderer/view` intact · `foundry.applications.handlebars.renderTemplate`
and `loadTemplates` · `TextEditor.enrichHTML` · `foundry.applications.apps.FilePicker.implementation` ·
`ChatMessage.getSpeaker` / `applyRollMode` · `CONFIG.Canvas.polygonBackends.sight.testCollision` ·
`CONFIG.Token.movement.actions[x].teleport` (`blink` and `displace` both `true`) ·
`foundry.applications.instances` (a Map) · `ApplicationV2.prototype._insertElement` ·
`canvas.scene._viewPosition` and `animatePan` · `Actor#toggleStatusEffect` · `Combat#endCombat` ·
`JournalEntryPageProseMirrorSheet.EDIT_PARTS` (exactly `header, content, footer` — nothing added or
renamed).

**`JournalEntryPage` subtype declaration and `TypeDataModel` validation are intact at production scale** —
342 Librarian codex pages load with 0 validation failures and render custom sheets; Bibliosoph's three
subtypes likewise.

**There is still no `endCombat`/`combatEnd` hook.** Ending a combat deletes the document, so `deleteCombat`
remains the signal. Verified by running a full combat: `combatStart`, `updateCombat`, `deleteCombat`,
`combatRound`, `combatTurn`, `createCombatant`, `updateCombatant`, `preUpdateCombat`, `preDeleteCombat` all
fire.

**v14 adds a THIRD setting scope.** `CONST.SETTING_SCOPES` is `{CLIENT, WORLD, USER}` and
`game.settings.storage` is a 3-entry Map. Code treating scope as a world/client binary drops user-scoped
settings silently. `game.settings.storage.get("world")` is **not** localStorage-shaped despite core's own
comment: `WorldSettings` has `getSetting`/`getItem` and **no `removeItem`/`setItem`** — delete through
`doc.delete()`. Deleting an orphaned Setting is safe; `_castType` never runs on delete. And **`game.systems`
does not exist** in a world context — only `game.system`.

### Method notes — every one of these was earned by getting it wrong first

- **A grep that counts occurrences cannot tell a dead thing from the dead half of a live one.** Four false
  positives in one day, including an "11 dead CSS rules" claim where the real number was one.
- **`grep -E` with a pattern containing `(` is an unterminated group.** grep exits 2 and prints nothing, so
  `2>/dev/null | wc -l` reports `0` — indistinguishable from clean. Use `-F` for anything with regex
  punctuation, and **never suppress grep's stderr in a survey**.
- **A guard can sit on the preceding line.** Excluding lines that *contain* a guard yields false positives.
- **Scope greps to what actually ships.** `_backups/` and `testing/` inflated one audit roughly twofold, and
  a file absent from `esmodules` is never loaded at all.
- **To check whether a `CONST` property exists without a loaded world**, grep the installed bundle at
  `<install>/resources/app/public/scripts/foundry.mjs` — **with `CHAT_MESSAGE_TYPES` as a negative
  control.** A grep that finds a string proves only that the string is somewhere in 7.6 MB. A grep
  returning **0** for a property known to be removed proves the search distinguishes present from absent.
  Without the control it is a text search, not evidence.
- **Distinguish "does not match" from "cannot match in this state."** A theme-scoped selector correctly
  returns 0 when the element is in another theme. Force the state transiently and re-read before reporting
  breakage.
- **An absence found on one version is evidence about that version only.** There is no Foundry v13 on the
  author's machine — one install, 14.367.0, one `foundry.mjs`. **"Removed in v14" is unproven here**; the
  honest form is *"absent on 14.367, history unknown"* — enough to guard against, not enough to delete on.
  Two sessions asserted v13 checks they had not performed. **Phrase CHANGELOGs accordingly.**
- **`minimum: "13"` is asserted but untested.** Nobody in this migration could verify the v13 half. It is
  probably fine — the work removed deprecated usage rather than adopting v14-only APIs, which is the
  direction that preserves compatibility — but it is untested rather than tested.

### Driving a live client

Launch Foundry with `--remote-debugging-port=9222` and drive it over the DevTools Protocol using Node's
built-in `WebSocket`: `fetch('http://localhost:9222/json/list')` for the `/game` target, then
`Runtime.evaluate`. `Page.reload {ignoreCache: true}` is required to pick up edited ES modules, and Foundry
re-reads `module.json` only at **server** start, so a module's reported version lags a page reload.

**Never `await` a call that opens a user-facing dialog** — the promise resolves on a button click and the
evaluation blocks forever. Fire it, wait a fixed interval, then close. **Do not synthesise a `contextmenu`
or a drag**: a half-working synthetic pointer sequence gives worse data than none, and the failure mode
usually under test is "the wrong handler claimed the event". Restore any state you change, and prefer
reading an existing document over creating one.

## Authoritative resources

| Resource | Use |
|----------|-----|
| [API reference](https://foundryvtt.com/api/) | Current class/method signatures |
| [Migration article index](https://foundryvtt.com/article/migration/) | Links to version-specific deep dives (note: the index page still emphasizes older cycles; v14 detail is mostly in release notes) |
| [v14 stable release (14.359)](https://foundryvtt.com/releases/14.359) | User-facing highlights + pointer to the full v14 cycle |
| **Full v14 development arc** (read in order for API evolution) | [14.349 Prototype 1](https://foundryvtt.com/releases/14.349) → [14.352](https://foundryvtt.com/releases/14.352) → [14.353](https://foundryvtt.com/releases/14.353) → [14.354 API Dev 1](https://foundryvtt.com/releases/14.354) → [14.355 API Dev 2](https://foundryvtt.com/releases/14.355) → user-testing builds → **14.359** |
| [Application V2 wiki](https://foundryvtt.wiki/en/development/api/applicationv2) | UI architecture (still the right direction for v14) |
| [Active Effects article](https://foundryvtt.com/article/active-effects/) | Conceptual background; v14 extends behavior significantly |

Discord `#dev-support` is the official channel for ambiguous API questions.

---

## Operational checklist (before touching code)

1. **Backup** full User Data.
2. **v14 is not an in-app upgrade** from v13: uninstall/reinstall Foundry (or use a **separate install**, e.g. Windows portable) per [installation / multiple installs](https://foundryvtt.com/article/installation/#multiple).
3. In Setup, use **Check for Update** and **Preview Compatibility** for systems/modules.
4. On first world load in a new generation, **modules are often disabled by default**; re-enable incrementally.
5. Prefer a **dedicated test world** on v14 before migrating live games.

---

## Major v14 themes that affect module code

### Scene Levels

Multi-level scenes stack imagery and logic in **one** `Scene`. Vision, movement, occlusion, and placeables are **level-aware**.

**Implications for modules:**

- Anything that assumes a single “flat” scene or a single background may need to account for **current viewed level**, **level elevation**, and **surfaces**.
- New UI: **Placeables** sidebar tab, **Placeables Palette** (bulk edit) — hooks or DOM assumptions around old region-only “legend” patterns may need updates.
- Canvas APIs gained level-related types and behaviors (e.g. `Level`, region/elevation fields, occlusion modes such as `SURFACE`). Consult v14 API docs when touching canvas, fog, walls, or tokens.

### Measured Templates removed → Template Regions

v14 **removes the `MeasuredTemplate` document type**; capability moves into **Scene Regions** (including a measured-template-style workflow on the Region layer).

**Implications:**

- Any code that queries/creates `MeasuredTemplate` documents or listens for template-specific hooks must be **rewritten** against **regions** (and related placement APIs).
- This is a **hard fork** in behavior: you cannot pretend v13 templates still exist on v14.

### Active Effects v2

Substantial expansion: token-facing changes, durations/expiry events, registry, compendium-stored effects, etc.

**Notable breaking/schema shifts (from release notes):**

- `ActiveEffect#changes` migrated toward **`ActiveEffect#system#changes`** (see 14.353 breaking changes).
- `EffectChangeData#mode` → string **`#type`** (14.352).
- `EffectChangeData#value` deserialized as **JSON** where possible (14.352).
- `ActiveEffect#origin` as **`DocumentUUIDField`** (14.352).
- Token / actor data references in effect values (14.353).
- New concepts: **`ActiveEffect.registry`**, effect **`phase`**, **`subtract`** mode, token overrides on the actor, etc.

**Implications:** modules that read/write effect changes, patch sheets, or assume v13 field paths need a careful pass.

**Verified on a live v14.364 / dnd5e 5.3.3 world, 2026-09-09 -- and the answer for Blacksmith is "do
nothing".** A probe created an effect with the v13 shape, top-level `changes: [{key, mode: 2, value: "1"}]`,
and core returned `system.changes: [{key, type: "add", value: 1, phase: "initial", priority: 0}]`. **Foundry's
shim performs both halves of the migration** -- it relocates the array under `system` AND converts the numeric
`mode` to the string `type`, supplying `phase` and `priority` defaults.

The consequence is counter-intuitive and worth stating plainly: **for a module declaring `minimum: 13,
maximum: 14`, emitting the LEGACY shape is correct.** It is native on v13 and shimmed on v14, so one codebase
serves both generations with no `game.release.generation` branch. Emitting the modern shape is what would
break, because `system.changes` does not exist on v13. `scripts/parsers/parse-item.js:552` passes
caller-supplied changes through verbatim and therefore needs no change.

The `type` vocabulary is a lowercase of `ACTIVE_EFFECT_MODES`, confirmed across ~2,400 real changes in the
author's world: `custom`, `multiply`, `add`, `downgrade`, `upgrade`, `override` (numerics 0-5, unchanged on
v14 -- `foundry.CONST.ACTIVE_EFFECT_MODES` still exists). Recorded here because nothing needs it yet and the
shim is borrowed time: when core drops it, this is the map, and the decision above flips.

`ActiveEffect#type` in the document schema is the DataModel SUBTYPE (`base`, `enchantment`), not the change's
`type`. They are different fields with the same name at different levels, and confusing them is the easy
mistake here.

### ProseMirror; TinyMCE removed

v14 completes migration to **ProseMirror**; **TinyMCE is removed** from core (14.354). An **external integration API** exists if a package wants to bring TinyMCE back.

**Implications:**

- Journal/chat rich text behavior differs; modules that **inject TinyMCE-specific** scripts, CSS, or editor hooks will break unless they adapt to ProseMirror or bundle TinyMCE themselves.
- Chat input uses an **inline ProseMirror** editor (from earlier prototypes through stable).

### Pop-out applications

Core supports **rendering dialogs/apps in a separate window** (user-facing highlight from 14.349+). Application V2 patterns align well; test **state**, **drag/drop**, and **z-index** when popped out.

### Chat: visibility modes vs “roll mode”

14.355: **Chat Message Visibility Modes** replace the old roll-mode concept (broader than dice). **Backwards-compatible** support for old roll modes is kept **until v16**.

**API note:** `ChatLog.MESSAGE_PATTERNS` deprecated in favor of **`ChatLog.CHAT_COMMANDS`** (removal in v16) — update custom slash commands accordingly.

### UI / icon / infrastructure

- **Font Awesome 7** (e.g. 14.359) — icon class names may differ from v13.
- **Electron 40**, **Node 24** minimum (14.355) — affects native deps or build assumptions for tooling *outside* Foundry, not usually module JS.
- **Express 5** server-side (14.352) — relevant if you ship server code or proxy patterns (unusual for typical modules).

### Canvas / data misc.

- **`TokenDocument#detectionModes`** → `TypedObjectField` (14.352).
- **`TokenMovementActionConfig#getAnimationOptions`** signature: `(token: Token)` → `(token: TokenDocument)` (14.352).
- **Wall / edge management** moved toward documents and `Level#edges` (14.355) — custom wall or LOS code may need review.
- **`TextureData`**: removed unused `offsetX/Y` and `rotation` (14.354).
- **`ImageHelper#createThumbnail`** return shape: `properties`, `src`, `texture` **deprecated** (14.354).
- **Data model validation** pipeline adjustments (14.352) — deep custom `DataModel` subclasses may see different error timing.
- **Grid / hex** stricter cube coordinates (14.353) — invalid coords throw.
- **Notes:** author field and permission behavior change (14.353) — modules altering notes should re-read ownership rules.

---

## Suggested engineering workflow

1. **Inventory** (grep / static analysis):
   - `MeasuredTemplate`, template layer, legacy template hooks
   - `FormApplication`, `Application` (V1), vs `ApplicationV2`
   - `ActiveEffect`, `changes`, effect modes, duration handling
   - `ChatLog.MESSAGE_PATTERNS`, roll modes, custom chat commands
   - TinyMCE / `TextEditor` usage, journal enrichment
   - Canvas: walls, regions, tokens, fog, thumbnails, detection modes
2. **Run on v14** with `CONFIG.debug.compatibility` set appropriately (see core docs) to surface deprecations.
3. **Fix breaking areas first** (hard errors), then **deprecations**, then **v14-only enhancements** (levels, new region behaviors).
4. Update **`module.json` `compatibility`**:
   - Set `minimum`, `verified`, and `maximum` to reflect what you actually test.
   - Blacksmith currently declares `minimum: "13"`, `maximum: "14"` — once v14 is verified, bump `verified` to `14` and test on both min and max.

### Required smoke-test matrix on v14

Do not treat “module loads without a red stack trace” as sufficient. For Blacksmith, run a short manual pass that exercises the parts most likely to break:

1. **Core load**
   - Enable Blacksmith on a clean v14 world.
   - Confirm init/ready completes without hard errors or compatibility spam that points to Blacksmith code.
2. **Window framework**
   - Open every remaining **V1 window** (`CSSEditor`, XP distribution, Journal Tools).
   - Confirm open, submit/apply, resize, close, and reopen all still behave correctly.
3. **Journal integration**
   - Open a journal sheet with Blacksmith enhancements enabled.
   - Switch pages repeatedly and confirm toolbar/tools/pins reattach correctly.
   - Test both inline journal rendering and **pop-out** journal windows.
4. **DOM assumptions**
   - Re-test any path that previously handled **jQuery vs native DOM** objects.
   - Confirm selectors, event delegation, and mutation observers still fire once per action.
5. **Canvas-linked features**
   - Verify pins / encounter UI / token-linked tools on an actual scene.
   - Re-test scene switch, token move, and sidebar refresh behavior.
6. **Compatibility logging**
   - Run once with compatibility warnings enabled and record every warning that resolves to Blacksmith-owned files.
   - Classify each as **must-fix now**, **acceptable short-term shim**, or **safe until v16**.

---

## Coffee Pub Blacksmith — quick codebase notes

These are **starting points** from a static scan; verify after a v14 load.

- **Application V1 / `FormApplication` still present** in places (e.g. XP distribution, journal tools window, CSS editor) while other windows use **Application V2** (`window-base.js`). Project convention targets V2; v14 is a good forcing function to **finish V2 migration** for remaining dialogs.
- **No `MeasuredTemplate` / TinyMCE hits** in scripts at time of writing — lower risk for the hardest v14 breaks unless added later.
- **Journal / ApplicationV2** integration already exists (`renderJournalPageSheet`, comments in `blacksmith.js`, `manager-journal-dom.js`, etc.) — re-test under v14 ProseMirror and pop-out scenarios.

### Blacksmith priority risks

If you are sequencing migration work for this repo, prioritize these before lower-risk cleanups:

1. **Remaining V1 windows are the most likely break/deprecation source.**
   - Confirm behavior for `CSSEditor`, XP distribution, and `JournalToolsWindow`.
   - If one of these fails on v14, migrate that window before spending time on lower-signal cleanup.
2. **Journal DOM integration is the next highest-risk subsystem.**
   - Blacksmith relies on `renderJournalPageSheet`, DOM watchers, and page-switch handling.
   - Re-test normal sheets, page navigation, and pop-outs before assuming journal features are v14-safe.
3. **Manifest verification should happen last, not first.**
   - Do **not** bump `verified` to `14` until the smoke-test matrix passes on a real v14 install.

---

## Opinion: one codebase (13+14) vs split branches

### Recommendation for this module: **prefer a single codebase**, with **narrow shims** only where unavoidable — **unless** template or effect work explodes in complexity.

**Reasons:**

1. **Manifest compatibility** already signals intent to support a range (`minimum`–`maximum`). Foundry’s ecosystem expects most modules to publish **one** current release compatible with a declared core band.
2. **Measured Template removal** is all-or-nothing on v14, but this project **does not currently reference** templates — no split required *for that* today.
3. **Active Effect schema** changes are annoying but usually manageable with **small adapter helpers** (e.g. read changes from `system.changes` vs legacy path) in one branch, rather than duplicating the entire module.
4. **Dual branches** double **release overhead**, bug backports, and issue triage. That cost is justified when:
   - a large subsystem is fundamentally different (e.g. heavy template tooling you must rewrite as regions while v13 users still need templates), or
   - `if (game.release.generation >= 14)` (or equivalent) would **dominate** readability and testing surface.

**When to split (or drop v13 sooner):**

- You need **long-term** v13 support *and* a **large** v14-only rewrite that would make the mainline unreadable.
- You maintain **incompatible** compendium or data formats between generations (rare for pure modules; more common for systems).

### Guardrails if you keep one codebase

Do not scatter generation checks through feature code unless there is no better option.

- Put version-sensitive behavior behind a **small compatibility layer** or helper module.
- Prefer helpers like “resolve current journal element” or “read active effect changes” over repeated inline `game.release.generation >= 14` checks.
- Keep the **call sites stable** and isolate Foundry-version differences in one place.
- If generation checks start appearing across unrelated files, treat that as a signal to refactor the adapter layer or reconsider support scope.

**Practical compromise:** single repo, **one main branch** targeting v14 once stable, with a **`release/v13` tag or branch** frozen for critical fixes only — clearer than permanent dual feature development.

---

## Changelog for this document

- **2026-04-11** — Raised Blacksmith-specific priority risks, added a v14 smoke-test matrix, and documented guardrails for a single 13/14 codebase.
- **2026-04-09** — Initial comprehensive pass from official v14 release notes (14.349–14.359) + Blacksmith codebase grep.
