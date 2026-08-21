# Blacksmith Importer API

**Audience:** Module authors and tools that want Blacksmith to describe, validate, or import supported content.

**Scope:** `api.importer` exposes the JSON import registry: a consuming module registers a kind, supplies validate and import callbacks, and gets Blacksmith's import window. That is the whole public surface.

**Architecture:** See `../architecture/architecture-importer.md`.

## The registry surface

This is the part that ships. Reach it through `module.api`:

```javascript
const importer = game.modules.get('coffee-pub-blacksmith')?.api?.importer;
if (!importer?.registerKind) return;   // older Blacksmith
```

Register during your module's `ready`. There is no `waitForReady()` on the API root -- only on
`api.sockets` -- so feature-detect the method you need instead of awaiting readiness.

| Method | Behavior |
|---|---|
| `registerKind(kind)` | Registers a kind descriptor. Throws if `kind.id` is missing or blank. |
| `getKind(kindId)` | Returns the registered descriptor, or `undefined`. |
| `openWindow(kindId)` | Opens the import window for a registered kind. Throws on an unknown id. |
| `parsePayload(jsonDataRaw)` | Parses a JSON string, object, or array into an array of entries. Throws with a fence hint on malformed input. |
| `attachButton(html, kindId)` | Inserts an Import button into a directory sidebar or compatible header. Respects `gmOnly`. |

The kind descriptor is typed as `JsonImportKind` in `scripts/registry-json-import.js:12`. The two callbacks
that matter to a consumer:

- `onValidateEntry(entry)` — check one entry and return the converted data, or throw. No documents are created.
- `onImportEntry(entry)` — create the document for one entry and return it.

Blacksmith calls both per entry and builds the result envelope; the caller owns document construction, so a
consuming module's schema never enters Blacksmith.

Two descriptor fields govern how a kind presents itself:

- `onProfileName(entry)` — which field on an entry names its profile. Defaults to `entry.type`.
- `showInSwitcher` — set `false` to keep the kind out of the import window's importer dropdown. Defaults to true,
  so a registered kind appears alongside Journal, Actor, Item, and Roll Table.

Prompt authoring fields (`templateOptions`, `promptCheckboxes`, `promptFields`, `onBuildPrompt`,
`onBuildJsonTemplate`, `onBuildAuthoringGuide`) are all optional. A kind that omits them gets the paste-and-import
window without the prompt-builder tab.
