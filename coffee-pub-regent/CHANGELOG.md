# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [13.0.0] - 2025-02-27

### Added

- **Coffee Pub Regent** as a standalone module. All AI tools (Consult the Regent, worksheets: Lookup, Character, Assistant, Encounter, Narrative) now live in this module and require Coffee Pub Blacksmith.
- **OpenAI API ownership**: Regent owns `api-openai.js` and exposes it for other modules via `game.modules.get('coffee-pub-regent')?.api?.openai` (set on `ready`). Methods include `getOpenAIReplyAsHtml`, `getOpenAIReplyAsHtmlWithMemory`, `callGptApiText`, `callGptApiTextWithMemory`, `callGptApiImage`, and session memory helpers.
- **Regent settings**: API key, model, game systems, prompt, context length, temperature, narrative options, and optional macro choice—all under Module Settings → Coffee Pub Regent → Regent (AI). Macro choices are sourced from Blacksmith’s API when available.
- **Documentation**: `documentation/plan-regent.md` (extraction plan) and `documentation/api-openai.md` (how to use the OpenAI API from Regent). Blacksmith docs now point to Regent for AI.

### Changed

- **Blacksmith**: No longer contains any OpenAI code or settings. AI features are provided only when the optional **coffee-pub-regent** module is enabled. Regent registers its toolbar tools (Consult the Regent, worksheets) via Blacksmith’s toolbar API.
- **OpenAI API access**: Consumers should use `game.modules.get('coffee-pub-regent')?.api?.openai` instead of Blacksmith’s former `module.api.openai`. Regent’s `api-openai.md` documents the full API.

### Fixed

- Clear separation of concerns: Blacksmith remains the shared-infrastructure hub; Regent is the optional AI/Regent feature module with a single, documented API surface for OpenAI.
- **Application V2 – Encounter worksheet buttons**: With Application V2, the window body is injected without executing `<script>` inside Handlebars partials. The encounter worksheet used inline `onclick` and functions defined in `partial-encounter-scripts.hbs`; that script never ran, so level/class +/- buttons, remove card, section toggles, and the difficulty slider’s `oninput` did nothing. Encounter worksheet logic is now in `regent-encounter-worksheet.js`: all handlers are registered on `window` at load (`registerEncounterWorksheetGlobals()`), and `addTokensToContainer` / `addAllTokensToContainer` are exposed on `window` (delegating to the Regent window instance) so inline handlers and the NPC drop zone work.
- **Application V2 – Add-token-from-canvas buttons**: The “Add All”, “Add Monsters”, “Add Players”, and “Add NPCs” buttons were only attached in `_attachWorksheetListenersToWrapper()`, which can run before the wrapper exists when the body is injected as a part. These buttons are now handled via document-level click delegation (with card buttons and workspace tabs), so they work regardless of wrapper attachment timing.
- **Styles**: Uncommented `@import "regent-workspace-forms.css"` in `default.css` so workspace/encounter styles load. Corrected the import filename from `regent-regent-workspace-forms.css` to `regent-workspace-forms.css`.
