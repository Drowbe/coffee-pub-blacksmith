# Blacksmith Importer Architecture

**Audience:** Contributors to Blacksmith and maintainers of tools that generate content for Blacksmith.

**Status:** Active incremental implementation. Shared authoring, validation, per-entry import orchestration, and result reporting are implemented for Item, Actor, Journal, and Roll Table importers; the public API and some domain-specific warning detail remain proposed.

Actor Import treats sidekicks as static dnd5e NPC snapshots. The Sidekick authoring profile records role, current level, narrative base creature, exact mechanical base-stat-block Actor name, and optional spellcasting ability in Blacksmith flags, while the supplied NPC system data and embedded items remain authoritative. Final HP, AC, proficiency, and features are accepted rather than inferred from CR. Validation warns when sidekick level and proficiency disagree, creature size and the HP formula's Hit Die disagree, the exact base Actor cannot be resolved, or supplied CR differs from the unscaled base Actor CR; it never silently recalculates the snapshot. Imported sidekicks are marked as important NPCs so dnd5e exposes death saves, and Blacksmith excludes their cosmetic CR/XP values from its monster encounter and XP calculations. Sidekick progression and automatic leveling are explicitly outside the current importer contract.

The friendly payload places `sidekick` at the Actor JSON root. This is an import envelope, not a native Foundry field: Blacksmith consumes it before creation and writes the normalized metadata to `flags["coffee-pub-blacksmith"].sidekick`. Already-native payloads using that flag location are also accepted. Spellcaster snapshots must use the same `int`, `wis`, or `cha` key in both `sidekick.spellcastingAbility` and `system.attributes.spellcasting`; validation warns when they diverge.

The friendly Actor schema's `token` block is likewise an authoring convenience. Before Foundry v13 Actor creation, Blacksmith merges it into `prototypeToken` (with explicitly supplied `prototypeToken` values taking precedence) and removes the legacy root key. This preserves generated token names, linkage, disposition, vision, bars, dimensions, and texture settings.

Character Snapshot authoring uses the same readable reference contract as other importers. Race/species, background, and subclasses are exact plain Item names or inline native definitions. Referenced classes add their final level count (`{ "name": "Barbarian", "levels": 15 }`), while inline native Class definitions carry `system.levels`; arrays support multiclass distributions. Blacksmith resolves names through configured Item sources, embeds the documents, applies class levels, and writes their new Actor-local IDs into dnd5e's relationship fields. Prompt preferences default to Auto, meaning the generator makes the choice and emits its exact resolved name rather than the word `Auto`. Snapshot import does not execute advancements, make choices, or auto-level.

Resolved Actor content may carry Actor-local state without becoming an inline definition: `{ "itemName": "Cloak of Protection", "itemType": "Equipment", "equipped": true, "attuned": true, "quantity": 1 }`, and Spell wrappers may add `prepared`. The resolver copies the exact world/compendium document, then applies only those state overrides (`system.quantity`, `equipped`, `attuned`, or numeric spell `prepared`). Plain strings remain references with source defaults. Wrapper validation rejects invalid quantity and `prepared` on non-Spells.

Actor prompt authoring exposes independently selectable configured Item, Feature, and Spell compendiums plus optional world content. Item catalogs include character-building documents such as race/species, backgrounds, classes, and subclasses along with equipment, tools, consumables, and other inventory, while excluding duplicate feat/spell entries supplied by their dedicated catalogs. Actor compendiums are intentionally absent: Actor construction references Items, Features, and Spells, while Sidekick base-stat-block Actor resolution continues through the configured global Actor mapping. Selected catalogs are appended to prompts with exact plain names and metadata; generated JSON never contains their UUIDs.

Raw native Character exports are a distinct future ingestion profile because their Actor details, containers, Active Effect origins, and other embedded data contain an interconnected graph of Actor-local IDs. Until that graph is remapped losslessly, the friendly Character Snapshot parser rejects native exports rather than producing a superficially successful but internally broken character.

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

Journal, Actor, Item, and Roll Table importers use the same window contract. A header switcher moves directly between those importers; switching saves the current importer's authoring choices and restores the destination importer's independent choices. The switcher changes content kind, while the three tabs continue to change authoring workflow.

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

## Catalog queries and linked content

Authoring workflows that reference existing content must use a shared, UI-neutral catalog query layer. A query identifies the document kind (`actor` or `item`), source (`world` or selected compendium ids), and typed filters. Actor filters include CR bounds, creature type, size, and name; Item filters include document type, rarity, magical status, and name.

Roll Tables expose only Foundry v13's `text` and `document` result types. World and compendium choices are source controls, not result types. Text tables may optionally consume a filtered catalog as unlinked source material. Document tables emit friendly exact names, document categories, and optional source ids; Blacksmith's centralized Compendium API resolves those names to UUID-backed `documentCollection`/`documentId` data during import. Prompt output receives only the filtered catalog, and a guided human template receives the same list with exact names and source ids. The planned Utility tab will expose these queries directly as plain-text lists; it must not create a second catalog implementation.

Exact linked references are the default. A prompt may explicitly request Text fallback, but Blacksmith must never silently convert a misspelled linked result into a different document. The author or AI does not supply UUIDs. Compendium selection is per configured pack and remains part of the request and friendly source context so external callers can reproduce the same resolution scope.

## Output delivery

Every authoring output supports:

- **Copy** to clipboard.
- **Save As** a plain-text file.

Authoring choices are remembered per user and per importer: selected profile/type, clean versus guided JSON output, structured fields, and checkboxes. Campaign-owned defaults such as Journal geography remain world state; transient paste/import results are not stored in authoring preferences.

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

Steps 1–6 are implemented in the shared window/registry. Current validation performs parse and kind conversion checks without document creation, and imports process entries independently so failed entries can be retried without recreating successful entries. The result screen preserves the submitted payload and exposes per-entry status, errors, created-document links, complete/individual report copying, Retry Failed, Edit and Retry, and Import Another. Rich warning capture from every legacy domain helper and the stable public API remain follow-up work.

Do not expose an API method as stable until its behavior and result shape match `api-importer.md`.
