# Plan: the wider Importer API

**Status: Planned.** Nothing in this document is implemented.

The JSON import *registry* shipped and is public as module.api.importer -- egisterKind, getKind,
openWindow, parsePayload, ttachButton. That surface is documented in ../api/api-importer.md and is
not part of this plan.

What follows is the larger contract that was drafted alongside it and never built: capability discovery,
template and prompt authoring outputs, and alidateJson / importJson with a structured result envelope.
It lived in the API document for a while, describing a namespace that did not exist. It is here instead so
that the API document describes only what ships.

**Before building any of it, decide whether it is still wanted.** The registry with caller-supplied
onValidateEntry / onImportEntry callbacks already covers the case that drove the first consumer request,
and it does so without Blacksmith knowing a consuming module's data model -- which is the property this
larger surface would have to preserve anyway. If it is not wanted, delete this file.

Per the plans rule: when it is built, distribute it -- surface to ../api/api-importer.md, design to
../architecture/architecture-importer.md, history to CHANGELOG.md -- and delete this file.

---
## Goals

The Importer API would let another tool:

- Discover supported kinds, profiles, and options.
- Request a clean JSON template.
- Request a human-guided template.
- Request a complete AI prompt or composable prompt parts.
- Validate JSON without creating documents.
- Import JSON and receive structured results.

Blacksmith owns schema compatibility and Foundry document construction. Callers own how they collect intent and how JSON is authored.

## Access

The proposed methods would live on the same `api.importer` namespace as the registry surface above. Callers
feature-detect the method they need.

## Core concepts

### Kind

Top-level document family, such as `item`, `actor`, `journal`, or `rolltable`.

### Profile

A schema specialization within a kind, such as:

- `item.weapon`
- `item.feature`
- `actor.npc`
- `journal.area`

### Options

Validated selections declared by the profile. Options have one of three scopes:

- `schema` — affects JSON Template and Prompt Template.
- `creative` — affects Prompt Template only.
- `import` — affects validation/creation only.

### Payload

A JavaScript object, array of objects, or JSON string accepted for validation/import.

### Catalog query

A reusable request for existing content. The planned API exposes the same query contract used by Roll Table prompts/guides and the future Utility tab:

```javascript
const result = await importer.queryCatalog({
  kind: 'actor',
  source: 'compendium',
  compendiumIds: ['dnd5e.monsters'],
  filters: { actorCrMin: 2, actorCrMax: 4, actorType: 'humanoid', nameSearch: '' },
  format: 'text'
});
```

Item filters include item type, rarity, magical status, and name. Actor filters include exact/minimum/maximum CR, creature type, size, and name. Results retain exact document names, ids/UUIDs, pack ids, images, and relevant filter metadata. This method is proposed until published on `module.api`.

Roll Table authoring exposes only `text` and `document`. For a Document result, callers provide the exact catalog name, canonical document type, and optionally the selected source id. They do not provide a UUID. Blacksmith resolves the friendly reference through `api.compendiums.resolve(..., { exact: true, sources })` during import and writes Foundry's document collection/id fields.

## Capability discovery

### `getCapabilities(request?)`

Returns supported kinds/profiles and their option definitions.

```javascript
const capabilities = importer.getCapabilities({ kind: 'item', profile: 'weapon' });
```

Proposed response:

```javascript
{
  apiVersion: 1,
  kinds: [
    {
      id: 'item',
      label: 'Item',
      profiles: [
        {
          id: 'weapon',
          label: 'Weapon',
          schemaVersion: 1,
          outputs: ['json', 'guided', 'prompt'],
          acceptsNativeFoundryJson: true,
          options: [
            {
              id: 'includePassiveEffects',
              label: 'Include Passive Effects',
              scope: 'schema',
              type: 'boolean',
              default: false
            }
          ]
        }
      ]
    }
  ]
}
```

Callers should render options from capability metadata rather than hardcoding current Blacksmith choices.

## Authoring outputs

All authoring methods return text. Callers may copy it, save it as plain text, display it, or send it to another service.

### `getJsonTemplate(request)`

Returns directly parseable JSON with neutral values.

```javascript
const result = await importer.getJsonTemplate({
  kind: 'item',
  profile: 'weapon',
  options: {
    includePassiveEffects: true,
    includeArtificer: false
  }
});
```

Proposed result:

```javascript
{
  format: 'json',
  mimeType: 'text/plain',
  suggestedFilename: 'blacksmith-item-weapon-template.txt',
  text: '{\n  "itemName": "",\n  ...\n}',
  summary: 'Weapon template · passive effects included · Artificer omitted',
  kind: 'item',
  profile: 'weapon',
  schemaVersion: 1
}
```

`text` contains raw JSON only. It must parse without removing comments, fences, or instructions.

### `getAuthoringGuide(request)`

Returns a human-oriented plain-text authoring document containing a clearly delimited JSON template plus instructions.

```javascript
const result = await importer.getAuthoringGuide({
  kind: 'item',
  profile: 'weapon',
  options: { includePassiveEffects: true }
});
```

The guide explains required fields, allowed values, relationships, automatic behavior, and limitations. The complete guide is not itself an import payload.

### `getPromptTemplate(request)`

Returns a complete plain-text prompt for an AI or other instruction-driven generator.

```javascript
const result = await importer.getPromptTemplate({
  kind: 'actor',
  profile: 'npc',
  options: {
    actorPurpose: 'boss',
    rulesPosture: 'balanced',
    inventoryPolicy: 'complete'
  },
  context: {
    additionalInstructions: 'A harbor cult leader who fears open water.'
  }
});
```

The result uses the same envelope as `getJsonTemplate`, with `format: 'prompt'`.

### `getPromptParts(request)`

Optional advanced surface for tools that supply their own system/task framing but want Blacksmith-owned schema parts.

```javascript
const parts = await importer.getPromptParts({
  kind: 'journal',
  profile: 'area',
  options: { sceneEmphasis: 'social' }
});
```

Proposed response:

```javascript
{
  kind: 'journal',
  profile: 'area',
  schemaVersion: 1,
  parts: [
    { id: 'schema', role: 'schema', text: '...' },
    { id: 'profile', role: 'schema', text: '...' },
    { id: 'generation-direction', role: 'instruction', text: '...' },
    { id: 'campaign-context', role: 'context', text: '...' }
  ]
}
```

Part ids and roles must be versioned before this method becomes stable. Callers should prefer `getPromptTemplate` unless composition is necessary.

## Validation

The shared Blacksmith window and internal importer registry now use this result model. Publication as `api.importer.validateJson()` remains pending until the public namespace and capability/version surfaces are implemented.

### `validateJson(request)`

Validates without creating documents.

```javascript
const result = await importer.validateJson({
  kind: 'item',
  profile: 'weapon',
  payload: jsonText
});
```

Validation performs parsing, normalization, schema checks, and conversion checks. It may resolve references read-only when the profile requires them.

Proposed result:

```javascript
{
  operation: 'validate',
  status: 'warning',
  processed: 2,
  succeeded: 1,
  warned: 1,
  failed: 0,
  entries: [
    {
      index: 0,
      status: 'success',
      inputName: 'Tideknot Trident',
      kind: 'item',
      profile: 'weapon',
      warnings: [],
      errors: []
    },
    {
      index: 1,
      status: 'warning',
      inputName: 'Harbor Key',
      kind: 'item',
      profile: 'loot',
      warnings: [
        {
          code: 'UNRESOLVED_REFERENCE',
          stage: 'validate',
          path: 'items[0]',
          message: 'No matching Item named Old Harbor Map was found.'
        }
      ],
      errors: []
    }
  ]
}
```

Validation does not reserve ids or guarantee that external state remains unchanged before a later import.

## Import

The shared window currently performs per-entry validation/import and renders this envelope internally. The public `api.importer.importJson()` method described below is still proposed.

### `importJson(request)`

Validates, converts, creates, post-processes, and reports.

```javascript
const result = await importer.importJson({
  kind: 'item',
  profile: 'weapon',
  payload: jsonText,
  options: {
    destination: { type: 'world', folderId: null },
    duplicatePolicy: 'create',
    batchPolicy: 'continue'
  }
});
```

When a future duplicate policy updates an existing document in place, importer profiles may add preservation paths. Blacksmith-owned GM Notes are user-authored data and are preserved by default for every kind:

```javascript
preserveOnReimport: [
  ...blacksmith.gmNotes.PRESERVE_ON_REIMPORT
]
// flags.coffee-pub-blacksmith.gmNotes
```

Callers may add profile-specific paths but must not remove this default. The currently implemented importers use `duplicatePolicy: "create"` semantics and therefore have no existing-document merge stage yet.

Proposed successful entry:

```javascript
{
  index: 0,
  status: 'success',
  inputName: 'Tideknot Trident',
  kind: 'item',
  profile: 'weapon',
  document: {
    uuid: 'Item.abc123',
    id: 'abc123',
    name: 'Tideknot Trident',
    documentName: 'Item',
    type: 'weapon',
    destination: { type: 'world', folderId: null, packId: null }
  },
  warnings: [],
  errors: [],
  retryable: false
}
```

Proposed failed entry:

```javascript
{
  index: 1,
  status: 'error',
  inputName: 'Broken Spear',
  kind: 'item',
  profile: 'weapon',
  document: null,
  warnings: [],
  errors: [
    {
      code: 'INCONSISTENT_FIELDS',
      stage: 'validate',
      path: 'weaponVersatileDamageFormula',
      message: 'Versatile property and weaponVersatileDamageFormula must be supplied together.'
    }
  ],
  retryable: true
}
```

## Status rules

Operation status is:

- `success` — every entry succeeded without warnings.
- `warning` — no entry failed, but one or more entries produced warnings.
- `partial` — at least one entry succeeded or warned and at least one entry failed.
- `error` — every entry failed or the operation could not begin.

Entry status is exactly `success`, `warning`, or `error`.

Counts must match entry statuses:

```javascript
processed === succeeded + warned + failed
```

## Error shape

```javascript
{
  code: 'STABLE_MACHINE_CODE',
  stage: 'parse' | 'normalize' | 'validate' | 'convert' | 'create' | 'postProcess',
  path: 'activities[0].saveDC',
  message: 'Human-readable explanation.',
  details: {}
}
```

`code` is stable for programmatic handling. `message` may improve over time. `details` must remain serializable and must not contain document secrets unrelated to the request.

## Warnings

Warnings use the same shape as errors but do not prevent creation. Common categories include:

- Unresolved optional references.
- Ignored fields documented as irrelevant to the selected profile.
- Mechanics retained in prose because the friendly schema cannot automate them.
- Destination fallback.
- Backward-compatible alias use.

Warnings must be returned to the caller and displayed in Blacksmith. Console-only warnings are insufficient.

## Retry

Retry is a caller workflow built from entry results. A stable implementation may later expose `retryImport`, but the initial API should let callers select failed original entries and call `importJson` again.

Callers must not resubmit successful entries unless they intentionally want duplicates.

## Batch behavior

Default `batchPolicy` is `continue`: process entries independently and report all outcomes.

Future supported values may include:

- `continue` — keep processing after entry failure.
- `stop` — stop before processing later entries after the first failure.
- `atomic` — create all or none, only when a kind can guarantee rollback safely.

Do not advertise `atomic` until implemented for the requested kind/destination.

## Destinations

Capability metadata declares supported destinations. A request must not assume all kinds can write directly to compendiums.

Proposed shape:

```javascript
{
  type: 'world' | 'compendium',
  folderId: null,
  packId: null
}
```

Permission and pack-lock failures are create-stage errors.

## UI parity

Blacksmith's own importer window is a client of the same builders and result contract:

- JSON Template -> `getJsonTemplate` / `getAuthoringGuide`
- Prompt Template -> `getPromptTemplate`
- Validate -> `validateJson`
- Import -> `importJson`

The UI must not have hidden behavior unavailable to API callers except presentation concerns such as clipboard access, file dialogs, and opening a created sheet.

## Permissions

- Capability and authoring-output methods are read-only.
- Validation is read-only except unavoidable system preparation; it creates no documents.
- Import requires the Foundry permissions declared by the selected kind/destination and is expected to be GM-only initially.
- An external module cannot use Blacksmith to bypass Foundry permissions.

## Versioning

The namespace exposes `apiVersion`. Each profile exposes `schemaVersion`.

Callers should:

1. Feature-detect methods.
2. Inspect capabilities.
3. Supply only declared options.
4. Preserve unknown result fields.
5. Avoid parsing human-readable error messages when a machine `code` exists.

Breaking API changes require an `apiVersion` increment. Profile-only schema changes increment that profile's `schemaVersion`.

## Not yet guaranteed

Until this document's status changes to **Implemented**:

- `api.importer` may be absent.
- Method names and result details may still change during implementation.
- Current internal prompt builders are not a substitute for the public contract.
- External modules should not deep-import Blacksmith's internal registry or parser files.
