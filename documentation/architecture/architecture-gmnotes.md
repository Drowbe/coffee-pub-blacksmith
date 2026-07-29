# GM Notes Architecture

## Purpose

GM Notes is Blacksmith's document-annotation layer. It attaches GM-authored rich text to an existing Foundry Document without repurposing the document's own content fields. Items, Actors, Journal Entries, Journal Pages, and module-owned document sheets share the same storage and API.

## Storage

The target Document owns:

```text
flags.coffee-pub-blacksmith.gmNotes
```

The schema-versioned envelope owns Blacksmith's General `html`, derived `text`, `pinned`, `updatedAt`, and a `sections` map keyed by module id and section id. General writes never replace sections; section writes never replace General or a sibling namespace. `clear()` clears General while preserving sections; `clearSection()` removes only its addressed section. Persisted sections declare `editable`; live provider sections are always read-only. Namespace ownership is a cooperative API boundary, not isolation between JavaScript packages.

Live contributed sections are held in an in-memory provider registry and are never copied into document flags. Providers receive the resolved Document at render time, so shipped guidance versions with its owning module without creating a drifting second copy.

Storage is UI-gated, not encrypted. Any client receiving the underlying Document may inspect its flags.

## Resolution

Synchronous reads use `fromUuidSync()` and are appropriate for live Documents, world Documents, and already-loaded compendium Documents. Async reads first take the cheap synchronous path and then use `fromUuid()` so unloaded compendium Documents are first-class targets.

Bulk reads resolve concurrently and return a UUID-keyed Map.

## Mutation boundary

`canSet()` is the authoritative preflight. It resolves the target and distinguishes unresolved targets, unsupported Documents, locked compendiums, and insufficient update permission.

`set()` is compatibility-oriented and returns `null` after reporting failures. `setOrThrow()` raises `GMNotesWriteError` with the same typed reason. Successful writes use `render:false`, regenerate the plain-text mirror, preserve future fields, stamp `updatedAt`, and emit the shared change hook.

## Change event

`blacksmith.gmNotesChanged` includes the historical `{ uuid, note, document }` fields. A derived `context` object adds document identity and, for JournalEntryPage targets, parent JournalEntry UUID/name and breadcrumb. Navigation context is not duplicated in storage.

## Presentation

`GMNotesSheetUI` retains the automatic dnd5e Item/Container read-card integration.

`GMNotesFieldController` is the supported inversion-of-control path for module-owned sheets. The owner supplies one host. A single group header controls expansion of the entire GM NOTES area; beneath it the controller renders a flat list: Blacksmith-owned General, persisted sections, then contributed sections. Sections are expanded by default and attributed to their owning module. General and persisted sections declaring `editable: true` open the canonical editor; derived provider sections remain read-only and may explain their source with `sourceHint`. The controller also handles async loading, GM gating, enrichment, capability/read-only state, live refresh, and cleanup.

Refreshes are single-flight and coalesced. Async completions carry a generation guard so a destroyed controller cannot repaint retained DOM, and section enrichment runs concurrently after provider resolution. The editor debounces and serializes ProseMirror autosaves, flushing the latest value on explicit save or close rather than writing the target Document once per keystroke.

The canonical `GMNotesWindow` uses Blacksmith's Application V2 base and Foundry ProseMirror. Each window binds its own actions, avoiding the base class's legacy single-static-reference limitation when multiple note editors are open. Locked or non-writable documents open read-only with an explanation.

## Importers

General GM Notes are user-authored state and must be preserved by any future update-in-place importer. Persisted sections merge by `[moduleId][sectionId]`, with incoming content replacing only the same owned key. Contributed sections are not stored and take no part in import:

```text
flags.coffee-pub-blacksmith.gmNotes.{html,text,pinned,updatedAt}
```

Current JSON importers create new Documents, so no executable re-import merge stage exists yet. `GMNotesAPI.PRESERVE_ON_REIMPORT` publishes the required default for that future stage.
