# Plan: Extract Regent (AI Tools) to coffee-pub-regent

**Status:** Plan only — no code changes yet.  
**Target:** Option B — full extraction into a separate Foundry module.

---

## 1. Rationale

### Why extract Regent from Blacksmith

- **Blacksmith as a lean dependency**  
  Blacksmith is the core dependency for the Coffee Pub module ecosystem (Bibliosoph, Crier, Monarch, Scribe, Squire, etc.). Keeping it lighter improves load time and maintenance for every user and every dependent module, whether or not they use AI.

- **Optional AI / “clean game” support**  
  Many users do not want AI tooling in their game. Extracting Regent into an optional module lets them run a “clean” setup: install only Blacksmith (and other non-AI modules) and never enable coffee-pub-regent. No AI code, settings, or UI in their environment. This document does not take a stance on AI in games; the goal is to support both those who want Regent and those who explicitly do not.

- **Separation of concerns**  
  Regent is a distinct feature (OpenAI integration, multi-worksheet chat UI, encounter/narrative/character workflows). It fits the existing migration vision in `architecture-blacksmith.md` (service-regent → coffee-pub-regent) and keeps core focused on shared infrastructure and non-AI features.

---

## 2. Scope of what moves

### Code (to coffee-pub-regent)

| Item | Notes |
|------|--------|
| `api-openai.js` | Rehome; change all `MODULE.ID` / settings refs to Regent’s module ID. |
| `window-query.js` | Move as-is; update template/asset paths to `modules/coffee-pub-regent/...`. |
| `window-query-registration.js` | Move; update all fetch paths to Regent module. |
| `buildButtonEventRegent` / `buildQueryCard` | Move into a new `scripts/regent.js` (or equivalent) in the Regent module; this file owns opening the window and calling OpenAI. |

### Assets

| Item | Notes |
|------|--------|
| `templates/window-query.hbs` | Move. |
| `templates/window-query-workspace-*.hbs` | All 5 workspace templates. |
| `templates/partial-*.hbs` | Only those used exclusively by the query window (see window-query-registration.js for full list). |
| `styles/window-query.css` | Move (or merge into Regent’s main stylesheet). |
| Regent-specific lang keys | Copy from `lang/en.json` into Regent’s `lang/en.json` (OpenAI/Regent labels, hints, tooltips). |

### Settings (migrate to coffee-pub-regent)

All currently on `coffee-pub-blacksmith`:

- `openAIMacro`
- `openAIAPIKey`
- `openAIProjectId`
- `openAIModel`
- `openAIGameSystems`
- `openAIPrompt`
- `openAIContextLength`
- `openAITemperature`

Register these in the Regent module under its own module ID. Plan a one-time migration for existing worlds (read from Blacksmith settings once, write to Regent settings, then rely on Regent-only going forward).

### What stays in Blacksmith (and what is removed)

- **Remove:**  
  - `buildButtonEventRegent`, `buildQueryCard`, and any Regent-only helpers used only by that flow.  
  - Import and use of `OpenAIAPI`; `OpenAIAPI.initializeMemory()`; `module.api.openai`.  
  - Registration of the six Regent toolbar tools (regent, lookup, character, assistant, encounter, narrative).  
  - `api-openai.js` from `module.json` esmodules.  
  - `registerWindowQueryPartials()` and the Regent-specific partial registration from Blacksmith’s ready flow.  
  - Regent-only partial templates and `window-query*.hbs` (moved to Regent).  
  - OpenAI settings from `settings.js` (and corresponding lang keys if no longer needed).  
  - Hooks that exist only for `BlacksmithWindowQuery` (if none of Blacksmith’s remaining code uses that class).

- **Keep:**  
  - All shared infrastructure (HookManager, SocketManager, toolbar API, pins, etc.).  
  - Any shared templates/partials that are used by non-Regent features.  
  - Documentation updates stating that AI tools are provided by coffee-pub-regent.

---

## 3. Contract between Regent and Blacksmith

Regent depends on Blacksmith; Blacksmith does not depend on Regent.

- **Toolbar**  
  Regent calls `BlacksmithAPI.get().registerToolbarTool(...)` (or equivalent) for each of the six tools, with `onClick` opening Regent’s own window. No Regent-specific code remains in `manager-toolbar.js`.

- **Templates**  
  Prefer moving every Regent-used template into coffee-pub-regent so Regent has no template dependency on Blacksmith. If one shared template is required, define a minimal API (e.g. `module.api.getCompiledTemplate(id)`) and document it; avoid Regent importing from Blacksmith’s bootstrap.

- **Sockets / hooks**  
  Regent uses Blacksmith’s socket and hook APIs only where needed (e.g. “player used Regent” notification). No changes to Blacksmith’s core for Regent beyond removing Regent code and optionally exposing a small, stable helper if needed.

- **OpenAI configuration**  
  All API key, model, prompt, memory, and project settings live under the Regent module ID. `OpenAIAPI` (in Regent) uses `game.settings.get(REGENT_MODULE_ID, ...)`.

---

## 4. Where to create the new module and workflow

Foundry loads one module per folder: each folder under `Data/modules/` whose name matches a module id (e.g. `coffee-pub-regent`) is treated as a separate module. So the new Regent module must eventually live as its own root folder that Foundry can see — either as a sibling of Blacksmith or via a symlink.

Two practical workflows:

### Option A — Regent as a subfolder inside the Blacksmith repo **(recommended; use this first)**

Create the new module **inside** the Blacksmith repo, then point Foundry at it. Once Regent is working, the folder can be moved out to a separate repo if desired.

1. **Create the module folder**  
   Inside the Blacksmith repo, create a full module tree, e.g.  
   `coffee-pub-blacksmith/coffee-pub-regent/`  
   with the usual structure: `module.json`, `scripts/`, `templates/`, `styles/`, `lang/`, etc.

2. **Move (or copy) files there**  
   Move the Regent-related files from Blacksmith into this subfolder (see scope in §2). You now have one repo containing both modules on disk; Regent lives at  
   `.../coffee-pub-blacksmith/coffee-pub-regent/`.

3. **Make Foundry load Regent**  
   Foundry does not scan inside another module’s folder, so it will not see `coffee-pub-regent` inside `coffee-pub-blacksmith`. Do one of:
   - **Symlink (good for development):** In `Data/modules/`, create a symlink named `coffee-pub-regent` that points to `coffee-pub-blacksmith/coffee-pub-regent`. Foundry then loads both modules; you edit files in one place.
   - **Copy (or build step):** Copy `coffee-pub-blacksmith/coffee-pub-regent` to `Data/modules/coffee-pub-regent` when you want to test; or add a script that does this. Less convenient for day-to-day dev.

4. **Later: move out (optional)**  
   Once Regent is working, you can move the folder out: copy the contents of `coffee-pub-blacksmith/coffee-pub-regent/` into a new repo (e.g. `coffee-pub-regent`) and use it as a sibling of Blacksmith under `Data/modules/`. The symlink can then point to the new location, or you can remove it and rely on the sibling folder. Keeping both in one repo with the symlink is also fine long term.

### Option B — Regent as a sibling folder from the start

Create the new module as a **sibling** of the Blacksmith folder (same parent), not inside it.

- Paths:  
  `Data/modules/coffee-pub-blacksmith/`  
  `Data/modules/coffee-pub-regent/`

- Workflow: Create `coffee-pub-regent` (new folder or clone of a new repo), then copy or move the Regent files from Blacksmith into it. Foundry sees both modules with no symlink. Good if you want two repos from day one or already have a monorepo layout with multiple module roots.

---

## 5. Implementation plan (Option B)

### 5.1 New module shell

- Create `coffee-pub-regent` (new directory or repo).
- Add `module.json`: unique id (e.g. `coffee-pub-regent`), `requires: ["coffee-pub-blacksmith"]`, correct Foundry version compatibility, esmodules list, styles, lang, etc.
- Add `scripts/const.js` with Regent’s `MODULE` (id, name, title, version, etc.).

### 5.2 Move and adapt code

- Copy `api-openai.js` into Regent; replace every `MODULE` reference with Regent’s const; ensure all settings use Regent’s module ID.
- Copy `window-query.js` and `window-query-registration.js` into Regent; update every path from `modules/coffee-pub-blacksmith/...` to `modules/coffee-pub-regent/...`.
- Create `scripts/regent.js` (or equivalent) that:
  - Exports `buildButtonEventRegent(worksheet)` and contains the logic for opening the query window and wiring submit to the OpenAI flow.
  - Contains `buildQueryCard(question, queryWindow, queryContext)` (or equivalent) that uses `OpenAIAPI` and updates the query window UI.
  - Performs one-time init: e.g. register Handlebars partials, call `OpenAIAPI.initializeMemory()`, register the six toolbar tools with Blacksmith’s API.
- Ensure `window-query.js` (and any new orchestrator) only import from: Regent’s const, Regent’s api-openai, Blacksmith’s public API (e.g. `BlacksmithAPI.get()` for toolbar, sockets, and any minimal helpers), and Foundry. Replace `getCachedTemplate` usage with either a local Regent cache or a single, documented Blacksmith API for that template if one is shared.

### 5.3 Move assets and paths

- Move all Regent-related templates and `window-query.css` into the Regent module.
- Update `window-query.js` and `window-query-registration.js` so every template fetch and reference uses `modules/coffee-pub-regent/...`.
- Copy Regent-specific strings from Blacksmith’s `lang/en.json` into Regent’s `lang/en.json`.

### 5.4 Settings migration

- In the Regent module, register all OpenAI-related settings under the Regent module ID.
- Add a one-time migration (e.g. in Regent’s init or ready): if Regent settings are empty and Blacksmith’s OpenAI settings exist, copy values over and then use Regent-only settings thereafter. Document this in the Regent README/changelog.

### 5.5 Blacksmith cleanup

- Remove from `blacksmith.js`: `buildButtonEventRegent`, `buildQueryCard`, OpenAIAPI import and `OpenAIAPI.initializeMemory()`, openAI settings cache entries, `module.api.openai`, and Regent-specific partial registration.
- Remove the six Regent tools from `manager-toolbar.js`’s default registration (or equivalent); Regent will register them via the toolbar API.
- Remove `api-openai.js` from `module.json` esmodules.
- Remove OpenAI settings from `settings.js`; remove or adjust Regent-specific lang keys.
- Remove or relocate `window-query-registration.js` and Regent-only partials from Blacksmith.
- Remove hooks that only served `BlacksmithWindowQuery` if nothing else in Blacksmith uses that class.

### 5.6 Documentation

- **Blacksmith:** Update `architecture-blacksmith.md` and any API docs to state that AI tools (Regent) are provided by the optional module `coffee-pub-regent`; link to that module’s docs. Remove or archive `api-openai.md` from Blacksmith (or replace with a short “use coffee-pub-regent” pointer).
- **Regent:** Add a README and, if useful, a short API doc (installation, OpenAI configuration, toolbar tools, and any public API for other modules).

### 5.7 Testing and release

- Verify: Blacksmith alone loads and runs with no Regent code and no OpenAI settings; no “Consult the Regent” (or equivalent) tools on the toolbar.
- Verify: With coffee-pub-regent enabled, all six tools appear, each worksheet opens, queries run, and responses display; settings live under Regent; existing worlds that had OpenAI settings get migrated once.
- Version and release both modules; document in changelogs that Regent is now optional and that users who want a “clean” (no-AI) game can omit coffee-pub-regent.

---

## 6. Summary

- **Goal:** Regent (AI tools) live entirely in the optional module `coffee-pub-regent`. Blacksmith stays lighter and remains a dependency for all other Coffee Pub modules; users who do not want AI can run a clean game by not installing Regent.
- **Scope:** Move OpenAI API, query window, all Regent templates and assets, and Regent-specific settings into coffee-pub-regent; remove all of that from Blacksmith and have Regent register its tools via Blacksmith’s toolbar API.
- **Contract:** Regent depends on Blacksmith and uses only its public API; Blacksmith has no dependency on Regent.

This plan is intended as the single source of truth for Option B; implementation can follow the sections above step by step.
