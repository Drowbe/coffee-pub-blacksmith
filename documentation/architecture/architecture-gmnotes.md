# GM Notes Architecture

## Purpose

GM Notes is Blacksmith's document-annotation layer. It attaches GM-authored rich text to an existing Foundry Document without repurposing the document's own content fields. Items, Actors, Journal Entries, Journal Pages, and module-owned document sheets share the same storage and API.

## Storage

The target Document owns:

```text
flags.coffee-pub-blacksmith.gmNotes
```

The schema-versioned envelope currently owns `html`, derived `text`, `pinned`, and `updatedAt`. Migration and partial writes preserve unknown fields so the flag can safely acquire future metadata. `clear()` deletes the flag when it contains only note fields; if future fields exist, it clears the note-owned fields and leaves the broader metadata intact.

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

`GMNotesFieldController` is the supported inversion-of-control path for module-owned sheets. The owner supplies a host; the controller handles async loading, GM gating, enrichment, capability/read-only state, collapse memory, canonical editor launch, live refresh, and cleanup.

The canonical `GMNotesWindow` uses Blacksmith's Application V2 base and Foundry ProseMirror. Each window binds its own actions, avoiding the base class's legacy single-static-reference limitation when multiple note editors are open. Locked or non-writable documents open read-only with an explanation.

## Importers

GM Notes is user-authored state and must be preserved by any future update-in-place importer:

```text
flags.coffee-pub-blacksmith.gmNotes
```

Current JSON importers create new Documents, so no executable re-import merge stage exists yet. `GMNotesAPI.PRESERVE_ON_REIMPORT` publishes the required default for that future stage.

