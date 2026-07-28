# GM Notes API

**Audience:** Module developers consuming Blacksmith's GM Notes system.

**GM Notes** attaches GM-authored, GM-only notes to **existing Foundry documents** (Items, Actors, etc.) — a private annotation layer on the documents you already have. GM Notes does not create documents — it annotates existing Foundry ones. Notes are the first field of a broader metadata envelope; future fields (reveal timing, quest links, associated NPCs) live under the same flag and schema without breaking this API.

Access it via:

```js
const gmNotes = game.modules.get('coffee-pub-blacksmith')?.api?.gmNotes;
```

## Storage & privacy

Notes are stored on the **target document's own flags** (`flags["coffee-pub-blacksmith"].gmNotes`), addressed by **document UUID** at the API boundary. The envelope contains the GM's unowned General note and optional namespaced persisted module sections. Live contributed sections are never stored. This is UI-gated, not encrypted: the panel only renders for `game.user.isGM`, but the underlying flag travels to any client that can observe the document.

Blacksmith automatically injects its legacy read card into dnd5e `ItemSheet5e` and `ContainerSheet`. Module-owned Actor, Journal, JournalPage, and other custom sheets should mount the reusable field/controller described below rather than waiting for Blacksmith to recognize their sheet class.

## Envelope shape

```js
{
    schemaVersion: 2,
    html: "<p>Rich note body…</p>",  // authored content
    text: "Rich note body…",          // plain-text mirror (search index)
    pinned: false,
    updatedAt: 1719763200000,         // ms epoch of last write
    sections: {
        "coffee-pub-squire": {
            "quest-guidance": {
                id: "quest-guidance",
                moduleId: "coffee-pub-squire",
                label: "Quest Guidance",
                html: "<p>Module-owned annotation.</p>",
                text: "Module-owned annotation.",
                icon: "fa-solid fa-flag",
                weight: 100,
                updatedAt: 1719763200000
            }
        }
    }
}
```

`text` is regenerated from `html` on every write — never set it directly. Unknown/future envelope fields are preserved by note writes and clears. When `clear()` finds no broader fields it removes the flag; when broader metadata exists it clears only the note-owned fields and preserves that metadata.

## Methods

| Method | Returns | Description |
|---|---|---|
| `isAvailable()` | `boolean` | Whether the API is ready to use. |
| `get(uuid)` | `object \| null` | Full envelope, or `null` if the document has no note or can't be resolved. |
| `getHtml(uuid)` | `string` | Authored HTML (empty string if none). |
| `getText(uuid)` | `string` | Plain-text mirror — index this for `gm:` search. |
| `has(uuid)` | `boolean` | True if a non-empty note exists. Cheap; drives sheet badges. |
| `getAsync(uuid)` | `Promise<object \| null>` | Async equivalent of `get()`. Resolves unloaded compendium documents with `fromUuid()`. |
| `getHtmlAsync(uuid)` | `Promise<string>` | Async rich-HTML read. |
| `getTextAsync(uuid)` | `Promise<string>` | Async plain-text read. |
| `hasAsync(uuid)` | `Promise<boolean>` | Async existence check. |
| `getMany(targets)` | `Promise<Map>` | Resolve UUIDs/Documents concurrently. Map keys are requested UUIDs (or live Document UUIDs); values are envelopes or `null`. |
| `canSet(uuid)` | `Promise<object>` | Resolve the target and report `{ allowed, reason, message, document }`. |
| `getSection(uuid, moduleId, sectionId)` | `Promise<object \| null>` | Read one stored, namespaced module section. |
| `getSections(uuid, options?)` | `Promise<object[]>` | Read stored and live contributed sections. Options may disable either source. |
| `getPersistedSections(uuid)` | `Promise<object[]>` | Read only stored module sections. |
| `getContributedSections(uuid)` | `Promise<object[]>` | Execute registered providers and return their live sections. |
| `set(uuid, data)` | `Promise<object \| null>` | **Update** the note — a partial merge, not a replace. `data`: `{ html?, pinned? }`; **any field you omit keeps its current value**, so `set(uuid, { pinned: true })` preserves the existing `html` rather than clearing it. Regenerates `text`, stamps `updatedAt`, writes with `render:false`, fires the change hook. Resolves to the stored envelope, or `null` on failure. To actually empty a note, pass `{ html: '' }` — or use `clear()` to remove the note data entirely. |
| `setOrThrow(uuid, data)` | `Promise<object>` | Same write, but throws `gmNotes.WriteError` with a typed `reason` instead of returning `null`. |
| `clear(uuid)` | `Promise<boolean>` | Clear the GM's General note while preserving module sections. |
| `setSection(uuid, moduleId, sectionId, data)` | `Promise<object \| null>` | Create/update only the caller's stored section. |
| `setSectionOrThrow(uuid, moduleId, sectionId, data)` | `Promise<object>` | Typed-error variant of `setSection()`. |
| `clearSection(uuid, moduleId, sectionId)` | `Promise<boolean>` | Remove only the addressed stored section. |
| `registerProvider(moduleId, provider, options?)` | `Function` | Register live read-only sections and return an unregister function. |
| `unregisterProvider(moduleId, providerId?)` | `boolean` | Remove a registered provider. |
| `createField(uuid, options)` | `Promise<GMNotesFieldController>` | Create the reusable GM-only field/controller. |
| `renderField(uuid, options)` | `Promise<GMNotesFieldController>` | Compatibility alias for `createField()`. New integrations should use `createField()`. |

`uuid` may be a UUID string **or** a live Document.

The synchronous methods require a live Document or UUID that `fromUuidSync()` can fully resolve. Use the async methods for arbitrary compendium UUIDs.

## Write capability and typed errors

```js
const capability = await gmNotes.canSet(page.uuid);
```

Capability reasons are:

- `allowed`
- `unresolved`
- `locked-pack`
- `no-permission`
- `unsupported`

The result always contains `allowed`, `reason`, `message`, and `document`. A field should remain read-only and show `message` when `allowed` is false.

For code that needs a rejected Promise:

```js
try {
    await gmNotes.setOrThrow(page.uuid, { html });
} catch (error) {
    if (error instanceof gmNotes.WriteError) {
        console.warn(error.reason, error.message, error.document);
    }
}
```

The compatibility `set()` method catches the same failure, reports it through Blacksmith, and resolves `null`.

## Reusable field/controller

Custom sheets opt in instead of Blacksmith hunting for every sheet class:

```js
const controller = await gmNotes.createField(this.document, {
    label: 'GM Notes',
    collapsed: true,
    editable: true
});

controller.mount(root.querySelector('[data-gm-notes-host]'));
this._gmNotesField = controller;
```

`createField()` is the canonical factory. The controller mounts into an ordinary DOM element; it does not require ownership of an ApplicationV2 `PART`.

The controller exposes:

- `element`
- `document`
- `capability`
- `readOnly`
- `mount(root, { replace? })`
- `refresh()`
- `openEditor()`
- `destroy()`

It resolves compendium documents asynchronously, hides itself from non-GMs, renders enriched read content, opens Blacksmith's canonical ProseMirror editor, disables editing with an explanation and remedy for locked/no-permission targets, remembers collapse state locally, and refreshes from the shared change hook. It also sets `.read-only` and `data-gm-notes-read-only="true|false"` on its root so hosts can adapt layout without JavaScript.

The field is the canonical shared surface. It renders the GM's General note first, then persisted module sections, then live contributed sections. Module sections are attributed, read-only, and independently collapsible/hideable per user.

## Module sections

Use a provider when the content already lives in your module's document data and should always reflect that source:

```js
const unregister = gmNotes.registerProvider(
    'coffee-pub-bibliosoph',
    async document => {
        const html = document?.system?.gmnotes;
        return html ? [{
            id: 'running-this-injury',
            label: 'Running This Injury',
            html,
            icon: 'fa-solid fa-masks-theater',
            weight: 100
        }] : [];
    }
);
```

Providers may return one object, an array, or nothing. Provider failures are isolated and logged; they do not prevent General notes or other providers from rendering. Call the returned function during module teardown if the registration should be removed.

Use persisted sections only for annotations the module genuinely owns:

```js
await gmNotes.setSection(page, 'coffee-pub-squire', 'quest-guidance', {
    label: 'Quest Guidance',
    html: '<p>Stored module annotation.</p>',
    icon: 'fa-solid fa-flag',
    weight: 100
});
```

Modules must never write the General note and must not write another module's namespace.

Destroy the controller before replacing its host on rerender and when the owning sheet closes:

```js
this._gmNotesField?.destroy();
```

## Change event

Every General or persisted-section write/clear fires the global change hook. Section events additionally contain `section` and `changeType`.

```js
Hooks.on(game.modules.get('coffee-pub-blacksmith').api.gmNotes.CHANGE_HOOK, ({
    uuid, note, document, context
}) => {
    // note is the new envelope, or null on clear
    // JournalEntryPage context includes parentUuid, parentName, and breadcrumb.
});
```

The hook name is `blacksmith.gmNotesChanged`.

## Examples

```js
const gmNotes = game.modules.get('coffee-pub-blacksmith').api.gmNotes;

// Read
const body = gmNotes.getHtml(item.uuid);
const forSearch = gmNotes.getText(item.uuid);

// Write
await gmNotes.set(item.uuid, { html: '<p>Tied to Quest: Broken Orders.</p>' });

// Existence check (e.g. to badge a list row)
if (gmNotes.has(actor.uuid)) markRow(actor);

// Remove
await gmNotes.clear(item.uuid);
```

## Import preservation

GM-authored notes are user data. Importers that update documents in place must preserve:

```js
gmNotes.PRESERVE_ON_REIMPORT
// General-note field paths; inspect the value at runtime.
```

Blacksmith's current JSON importers create new documents and do not yet expose update-in-place conflict handling. The preservation path is the required default for that future stage. Locked module packs remain unsuitable for durable user-authored notes; copy shipped content into a world-owned compendium when notes must survive module replacement.

`REIMPORT_POLICY` further specifies that General note fields are preserved, persisted sections merge by `[moduleId][sectionId]` with incoming data winning only at the same key, and contributed sections are never stored.
