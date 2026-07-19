# Blacksmith Importer Architecture

**Audience:** Contributors to Blacksmith and maintainers of tools that generate content for Blacksmith.

**Status:** Target architecture. Existing Item, Actor, Journal, and Roll Table importers are being converged onto this design incrementally.

**Related documentation:**

- `../api/api-importer.md` — proposed public integration contract
- `../api/api-window.md` — shared Application V2 window contract
- `../../prompts/` — current prompt parts and profile contracts

## Purpose

Blacksmith should be the authoritative boundary between authored content and Foundry documents. Content may be written by hand, produced by a form, exported from another tool, or generated with AI. The importer must not require or assume any particular authoring method.

The canonical contract is:

```text
Blacksmith JSON schema -> validation/conversion -> Foundry document creation -> structured result
```

Human instructions and AI prompts are separate authoring adapters that help a user or tool produce JSON satisfying that contract. They are not the contract themselves.

This distinction is important both architecturally and socially: users who do not want AI should receive a complete first-class workflow, not an AI workflow with instructions removed.

## Product principles

1. **Import first.** Importing valid JSON is Blacksmith's primary responsibility.
2. **Authoring-method neutral.** Handwritten JSON, form-generated JSON, exports, and AI-generated JSON enter the same pipeline.
3. **Schema-owned.** Blacksmith owns field names, supported profiles, validation, conversion, and compatibility with Foundry/dnd5e.
4. **Prompts are derived assistance.** Prompt parts describe Blacksmith's schema; external tools should not need to reconstruct it independently.
5. **Human guidance is first-class.** A guided template must explain how to fill out valid JSON without requiring AI.
6. **Plain-text portability.** Copy to clipboard and Save As plain text remain supported for every authoring output.
7. **Visible outcomes.** Import windows remain open after processing and report successes, warnings, and failures.
8. **Repeatable workflow.** A user can correct failed content or import another payload without reopening the window.

## Window information architecture

Importer windows use three tabs in this order:

1. **Import JSON**
2. **JSON Template**
3. **Prompt Template**

The ordering communicates that AI is optional and that the importer is the core product.

### Import JSON

Accepts completed JSON from any source. This tab does not mention AI.

Responsibilities:

- Paste or edit JSON.
- Load a plain-text file.
- Validate without creating documents.
- Import and create documents.
- Preserve submitted JSON after processing.
- Display structured results.
- Offer Edit and Retry, Retry Failed, Import Another, and Close.

### JSON Template

Supports manual authoring. The user first selects a content kind/profile (for example Item -> Weapon), then applicable schema options.

Output modes:

- **Template Only:** valid raw JSON with neutral defaults.
- **Template + Instructions:** the same JSON plus human-readable field guidance in a plain-text document.

Instructions must never be inserted as JSON comments. Template Only must be directly parseable. Template + Instructions is an authoring document containing a clearly delimited JSON block and guidance; it is not pasted wholesale into Import JSON.

Examples of schema options:

- Include passive effects.
- Include activities and choose activity type/count.
- Include applied effects.
- Include limited uses and recovery.
- Include Artificer fields when available.
- Include optional image metadata.

Only options applicable to the selected kind/profile are shown.

### Prompt Template

Supports AI-assisted or other instruction-driven generation. The user selects the same content kind/profile, applicable schema options, and creative generation options.

The output is a plain-text prompt containing:

- The requested task.
- Campaign context where appropriate.
- The selected profile and schema contract.
- Selected generation direction.
- Validation and output rules.
- Optional integrations such as Artificer or image generation.

Prompt output must instruct the generator to return Blacksmith-compatible JSON. It must not create a competing schema.

## Option categories

Options are metadata, not arbitrary UI strings. Each option has an id, allowed values, default, applicable profiles, and effects on one or more outputs.

### Schema options

Change JSON shape. They affect JSON Template and Prompt Template consistently.

Example: `includePassiveEffects` adds a `passiveEffects` example to the JSON template and instructs a generator how to populate it.

### Creative options

Guide content but do not change schema. They appear only on Prompt Template.

Examples: lore depth, scene emphasis, Actor purpose, power posture.

### Import options

Control validation, destination, conflict handling, or creation. They appear only on Import JSON.

Examples: destination folder/pack, duplicate policy, dry run, and partial-batch policy.

### Capability gating

The selected kind/profile declares its supported options. The UI and API consume the same capability metadata. Unsupported values fail clearly; they are never silently ignored.

## Output delivery

Every authoring output supports:

- **Copy** to clipboard.
- **Save As** a plain-text file.

Blacksmith intentionally does not require a specialized editor or binary format. Suggested filenames may distinguish the output (`weapon-template.txt`, `weapon-template-guided.txt`, `weapon-full-prompt.txt`), but all remain readable in any text editor.

Before Copy/Save, the UI should show a compact output summary, for example:

> Weapon template · passive effects included · standard Attack generated automatically · Artificer omitted

## Import pipeline

The target pipeline is explicitly staged:

```text
parse -> normalize -> validate -> convert -> create -> post-process -> report
```

### Parse

- Normalize safe transport artifacts such as Markdown JSON fences and typographic quotes where supported.
- Parse one object or an array of objects.
- Retain an entry index and best-effort display name for reporting.

### Normalize

- Detect native Foundry data versus a Blacksmith-friendly schema.
- Resolve aliases retained for backward compatibility.
- Do not silently reinterpret unsupported fields.

### Validate

- Validate the envelope and selected profile.
- Validate field types, allowed values, and cross-field relationships.
- Produce errors for unsafe or impossible content.
- Produce warnings for recoverable omissions, unresolved references, or intentionally non-automated mechanics.
- Validation must be callable without document creation.

### Convert

- Convert friendly schema data into Foundry/dnd5e document source data.
- Preserve supported native Foundry JSON without lossy remapping.
- Generate standard system structures Blacksmith promises to create automatically.

### Create

- Enforce permissions.
- Create documents at the requested supported destination.
- Treat batch entries independently by default: one failed entry does not conceal successful entries.
- Do not retry or duplicate successful entries when Retry Failed is chosen.

### Post-process

- Resolve and embed referenced content.
- Apply Blacksmith flags/GM notes.
- Perform kind-specific follow-up work.
- Record warnings rather than hiding unresolved references in console output.

### Report

- Return a structured result for every input entry.
- Include document UUIDs for successful creations.
- Include warnings and precise stage-specific errors.
- Drive both UI presentation and external API responses from the same result.

## Result experience

The import window does not close automatically after processing.

Summary example:

```text
5 processed · 3 imported · 1 imported with warnings · 1 failed
```

Per-entry information:

- Status: success, warning, or error.
- Entry index, name, and requested kind/profile.
- Created document name, type, UUID, and destination.
- Warnings.
- Error stage, code, and message.
- Whether the entry is retryable.

Actions:

- Open a created document.
- Open All when appropriate.
- Copy an individual error.
- Copy the complete report.
- Edit and Retry using the preserved payload.
- Retry Failed without recreating successes.
- Import Another, which clears payload/results but preserves selected kind and options.
- Close.

## State model

```text
Editing -> Validating -> Ready
   |           |
   |           -> Validation Results -> Edit
   v
Importing -> Import Results -> Edit and Retry
                         |-> Retry Failed
                         |-> Import Another -> Editing
                         |-> Close
```

Busy state prevents duplicate submission but does not destroy the editor state.

## Registries and ownership

Each importer kind/profile should eventually register:

- Identity and labels.
- Friendly schema/version.
- Native Foundry types accepted.
- Template builder.
- Human-guide builder.
- Prompt-part builder.
- Schema and creative option definitions.
- Parser/normalizer/validator/converter.
- Creator/post-processor.
- Result-link behavior.

The shared importer owns window lifecycle, text delivery, batch orchestration, result aggregation, and public API routing. Kind implementations own domain rules.

## External tools

Tools such as Bibliosoph, Squire, Codex, and future modules should be able to ask Blacksmith for capabilities, templates, guides, and prompt parts. They may gather user intent or perform generation themselves, but should return JSON to Blacksmith's validator/importer.

Preferred relationship:

```text
external tool -> request Blacksmith schema/prompt parts -> produce JSON
              -> Blacksmith validate/import -> structured result
```

This avoids disconnected schemas, duplicated Foundry conversion code, and version drift.

## Compatibility and versioning

- Friendly schemas require explicit schema versions as they stabilize.
- Additive fields should preserve older payloads when safe.
- Renames use documented aliases for a bounded compatibility period.
- Prompt and guide versions derive from the schema/profile version they explain.
- API results include Blacksmith, Foundry, system, schema, and profile version context where useful.

## Security and permissions

- Document creation remains GM-only unless a kind explicitly supports another permission model.
- External registrations are namespaced by module id.
- Prompt text and JSON are data, never executable JavaScript.
- Native Foundry JSON is sanitized for identity and placement fields before creation where required.
- Errors returned to players or external tools must not expose secrets or unrelated document data.

## Incremental migration

Current importers do not yet implement every part of this architecture. Migration order:

1. Establish this architecture and API contract.
2. Reorganize the window into the three tabs.
3. Separate clean JSON templates, guided templates, and prompts.
4. Introduce shared validation/result types without changing creation behavior.
5. Keep the window open and render results.
6. Add Validate, Retry Failed, and Import Another.
7. Expose stable public API methods.
8. Migrate disconnected module workflows onto the shared contract.

Do not expose an API method as stable until its behavior and result shape match `api-importer.md`.
