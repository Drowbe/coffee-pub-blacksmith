# GM Notes API

**Audience:** Module developers consuming Blacksmith's GM Notes system.

**GM Notes** attaches GM-authored, GM-only notes to **existing Foundry documents** (Items, Actors, etc.) — a private annotation layer on the documents you already have. GM Notes does not create documents — it annotates existing Foundry ones. Notes are the first field of a broader metadata envelope; future fields (reveal timing, quest links, associated NPCs) live under the same flag and schema without breaking this API.

Access it via:

```js
const gmNotes = game.modules.get('coffee-pub-blacksmith')?.api?.gmNotes;
```

## Storage & privacy

Notes are stored on the **target document's own flags** (`flags["coffee-pub-blacksmith"].gmNotes`), addressed by **document UUID** at the API boundary. This is UI-gated, not encrypted: the panel only renders for `game.user.isGM`, but the underlying flag travels to any client that can observe the document. This is an intentional project decision — do not store true secrets here that a determined, console-using player must never see.

**v1 UI scope:** Items only (dnd5e `ItemSheet5e` + `ContainerSheet`). The API itself is document-type-agnostic and works on any document today; only the injected sheet panel is scoped to items for now.

## Envelope shape

```js
{
    schemaVersion: 1,
    html: "<p>Rich note body…</p>",  // authored content
    text: "Rich note body…",          // plain-text mirror (search index)
    pinned: false,
    updatedAt: 1719763200000          // ms epoch of last write
}
```

`text` is regenerated from `html` on every write — never set it directly.

## Methods

| Method | Returns | Description |
|---|---|---|
| `isAvailable()` | `boolean` | Whether the API is ready to use. |
| `get(uuid)` | `object \| null` | Full envelope, or `null` if the document has no note or can't be resolved. |
| `getHtml(uuid)` | `string` | Authored HTML (empty string if none). |
| `getText(uuid)` | `string` | Plain-text mirror — index this for `gm:` search. |
| `has(uuid)` | `boolean` | True if a non-empty note exists. Cheap; drives sheet badges. |
| `set(uuid, data)` | `Promise<object \| null>` | Replace the note. `data`: `{ html?, pinned? }`. Regenerates `text`, stamps `updatedAt`, writes with `render:false`, fires the change hook. Resolves to the stored envelope, or `null` on failure. |
| `clear(uuid)` | `Promise<boolean>` | Remove all note data from the document. |

`uuid` may be a UUID string **or** a live Document.

## Change event

Every `set` / `clear` fires a global hook so consumers (a future search index, sheet badges) can react:

```js
Hooks.on(game.modules.get('coffee-pub-blacksmith').api.gmNotes.CHANGE_HOOK, ({ uuid, note, document }) => {
    // note is the new envelope, or null on clear
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
