# Migrating modules from Foundry VTT v13 → v14

This document collects **official sources**, **notable breaking changes**, a **practical migration workflow**, and **project-specific notes** for Coffee Pub Blacksmith. It is a living guide: extend it as you discover edge cases.

---

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

---

## Coffee Pub Blacksmith — quick codebase notes

These are **starting points** from a static scan; verify after a v14 load.

- **Application V1 / `FormApplication` still present** in places (e.g. XP distribution, journal tools window, CSS editor) while other windows use **Application V2** (`window-base.js`). Project convention targets V2; v14 is a good forcing function to **finish V2 migration** for remaining dialogs.
- **No `MeasuredTemplate` / TinyMCE hits** in scripts at time of writing — lower risk for the hardest v14 breaks unless added later.
- **Journal / ApplicationV2** integration already exists (`renderJournalPageSheet`, comments in `blacksmith.js`, `manager-journal-dom.js`, etc.) — re-test under v14 ProseMirror and pop-out scenarios.

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

**Practical compromise:** single repo, **one main branch** targeting v14 once stable, with a **`release/v13` tag or branch** frozen for critical fixes only — clearer than permanent dual feature development.

---

## Changelog for this document

- **2026-04-09** — Initial comprehensive pass from official v14 release notes (14.349–14.359) + Blacksmith codebase grep.
