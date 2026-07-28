# Note to Bibliosoph: Preparing for First-Class Journal GM Notes

**From:** Blacksmith dev  
**To:** Bibliosoph dev  
**Re:** JournalPage GM Notes integration

## Multi-contributor update

The shared component now owns the entire GM Notes area. Bibliosoph should remove its separate “Running This Injury” block and register that content as a live provider:

```js
const gmNotes = game.modules.get("coffee-pub-blacksmith")?.api?.gmNotes;

this._unregisterGmNotesProvider ??= gmNotes?.registerProvider(
  "coffee-pub-bibliosoph",
  async document => {
    const html = document?.system?.gmnotes;
    return html ? [{
      id: "running-this-injury",
      label: "Running This Injury",
      html,
      icon: "fa-solid fa-masks-theater",
      weight: 100
    }] : [];
  }
);
```

Register once during module initialization, not once per sheet. The existing `createField(page)` mount automatically renders General plus this contributed section. The provider content is read-only and never stored in Blacksmith flags. If Bibliosoph later needs a genuinely stored annotation, use `setSection(page, "coffee-pub-bibliosoph", sectionId, data)` instead.

Thank you for the detailed review. We agree with the direction and are extending Blacksmith's GM Notes API around the journal and compendium requirements you identified.

Bibliosoph can prepare its Injury Page sheet now without creating temporary storage or a second notes convention. The integration should continue to treat the Injury `JournalEntryPage` as the annotated document.

## What Blacksmith provides

The existing synchronous API remains compatible:

```js
gmNotes.get(uuidOrDocument);
gmNotes.getHtml(uuidOrDocument);
gmNotes.getText(uuidOrDocument);
gmNotes.has(uuidOrDocument);
gmNotes.set(uuidOrDocument, data);
gmNotes.clear(uuidOrDocument);
```

Blacksmith now provides the following capabilities.

### Asynchronous document resolution

```js
await gmNotes.getAsync(uuidOrDocument);
await gmNotes.getHtmlAsync(uuidOrDocument);
await gmNotes.getTextAsync(uuidOrDocument);
await gmNotes.hasAsync(uuidOrDocument);
await gmNotes.getMany(uuidsOrDocuments);
```

These methods will accept a UUID or live Document. Already-resolved documents and synchronously available UUIDs will remain cheap; unloaded compendium documents will resolve through Foundry's asynchronous UUID resolver.

`getMany()` will resolve in parallel and return results keyed by the requested UUID so missing or unresolved entries are not confused with list order.

### Actionable write capability

```js
const capability = await gmNotes.canSet(uuidOrDocument);
```

The result will have an actionable shape:

```js
{
  allowed: false,
  reason: "locked-pack",
  message: "This document belongs to a locked compendium.",
  document
}
```

Expected reasons include:

- `allowed`
- `unresolved`
- `locked-pack`
- `no-permission`
- `unsupported`

The existing `set()` behavior will remain compatible. Blacksmith will also provide a typed failure path for consumers that need to distinguish resolution, lock, and permission failures rather than receiving `null`.

### Embeddable GM Notes field

Blacksmith provides a supported field/controller for module-owned sheets. Bibliosoph should not reproduce Blacksmith's editor markup or reach into Blacksmith's private sheet-injection implementation.

The component will own:

- Async note loading.
- Read and edit presentation.
- Locked-pack and permission-disabled states.
- Explanatory tooltips/messages.
- Collapse state.
- ProseMirror integration.
- Live refresh after another surface changes the note.
- Event binding and cleanup.
- Blacksmith's shared styling and accessibility behavior.

The public factory is:

```js
const controller = await gmNotes.createField(pageOrUuid, {
  label: "GM Notes",
  collapsed: true,
  editable: true,
  replace: true,
  className: "bibliosoph-injury-gm-notes"
});
```

`createField()` is the canonical factory; Bibliosoph can drop `mountField` probing. `renderField()` remains only as a compatibility alias. The controller mounts into an ordinary DOM element and exposes `element`, `document`, `capability`, `readOnly`, `mount(root, { replace? })`, `refresh()`, `openEditor()`, and `destroy()`. Its root also carries `.read-only` and `data-gm-notes-read-only="true|false"`.

### Richer change context

`blacksmith.gmNotesChanged` will remain the change hook. Its existing fields remain intact:

```js
{ uuid, note, document }
```

Journal Pages additionally receive derived navigation context, including the parent JournalEntry UUID/name and a useful breadcrumb. This context is derived at event time rather than duplicated in stored flags.

### Safe envelope evolution

Blacksmith's envelope behavior preserves unknown/future fields instead of rebuilding and discarding them. Clearing note content removes the flag when it contains note data alone, or clears only the note-owned fields when broader metadata exists, so future links, reveal state, or other annotations cannot be accidentally erased.

### Import preservation

The future Importer update-in-place contract will support preservation paths, with Blacksmith GM Notes preserved by default:

```js
preserveOnReimport: [
  ...gmNotes.PRESERVE_ON_REIMPORT
]
```

This does not make a locked module compendium a reliable user-data store. The durable workflow remains copying shipped content into a world-owned compendium and pointing Bibliosoph's `injuryCompendium` setting at that copy.

## What Bibliosoph should do now

### 1. Keep a stable host in the Injury Page sheet

Reserve a single container where Blacksmith's component will mount:

```html
<section
  class="bibliosoph-gm-notes-host"
  data-gm-notes-host
  aria-label="GM Notes">
</section>
```

Do not place note HTML in the Injury Page's `text.content`.

### 2. Put all compatibility logic behind one adapter

Do not spread GM Notes calls throughout the sheet. Use one Bibliosoph adapter so switching to the component is a localized change.

Until the component ships, use the current safe fallback:

```js
async function resolveGmNotesTarget(pageOrUuid) {
  if (pageOrUuid?.getFlag) return pageOrUuid;
  return fromUuid(String(pageOrUuid));
}

async function readGmNote(pageOrUuid) {
  const gmNotes = game.modules.get("coffee-pub-blacksmith")?.api?.gmNotes;
  if (!gmNotes) return null;

  if (typeof gmNotes.getAsync === "function") {
    return gmNotes.getAsync(pageOrUuid);
  }

  const document = await resolveGmNotesTarget(pageOrUuid);
  return document ? gmNotes.get(document) : null;
}
```

The adapter should prefer `createField()` and retain the fallback only for older compatible Blacksmith versions:

```js
if (typeof gmNotes.createField === "function") {
  const controller = await gmNotes.createField(pageOrUuid, {
    label: "GM Notes",
    collapsed: true
  });
  controller.mount(host);
  return controller;
}
```

### 3. Target the JournalEntryPage, not its parent

Pass the Injury Page document or its UUID:

```js
const target = this.document; // Injury JournalEntryPage
```

The parent JournalEntry is navigation context, not the note-storage target.

### 4. Treat capability as part of rendering

Before enabling editing:

```js
const capability = typeof gmNotes.canSet === "function"
  ? await gmNotes.canSet(page)
  : null;
```

If writing is unavailable, display the note read-only and explain why. Do not accept edits and then silently discard them.

For older Blacksmith versions without `canSet()`, Bibliosoph may use its existing conservative checks, but Blacksmith's capability result should become authoritative once available.

### 5. Clean up on rerender and close

Store the returned component/controller on the sheet instance. Destroy or unmount it before replacing the host during a rerender and when the sheet closes. This prevents duplicate hook listeners and stale ProseMirror instances.

### 6. Keep shared surfaces UUID-only

Continue the Check-Up card pattern:

- Store only the Injury Page UUID in shared ChatMessage HTML/data.
- Resolve and render the note only on the GM's local client.
- Never embed GM note HTML or plain text into the shared message.
- Refresh local presentation from `blacksmith.gmNotesChanged`.

This prevents a second copy of the note from being placed in shared chat data. It does **not** turn document flags into encrypted storage: a player who receives the underlying JournalPage may still inspect its flags.

### 7. Never write the flag directly

Do not call:

```js
page.setFlag("coffee-pub-blacksmith", "gmNotes", ...);
```

Always use `api.gmNotes`. Blacksmith owns schema migration, the text mirror, timestamps, preservation semantics, hooks, capability handling, and future metadata compatibility.

## What Bibliosoph does not need to build

Bibliosoph does not need:

- A private injury-notes flag.
- A duplicate ProseMirror notes editor.
- A custom GM Notes schema.
- A sheet-class registration system for Blacksmith.
- A compendium-resolution cache.
- Its own locked-pack error taxonomy.
- Note HTML in chat cards.

Once the new API is available, Bibliosoph's work should be limited to placing the host, mounting the shared component through its adapter, and deciding where the field belongs in the Injury Page layout.

## Integration verification

When Blacksmith publishes the extension, verify:

1. A world Injury Page loads, edits, saves, and live-refreshes.
2. An unloaded compendium Injury Page resolves asynchronously.
3. A locked module-pack Injury Page displays read-only with a useful explanation.
4. A copied world-compendium Injury Page permits editing when the GM has permission.
5. Two open surfaces update after `blacksmith.gmNotesChanged`.
6. Reopening or rerendering the Injury sheet does not duplicate listeners/editors.
7. The Check-Up card contains only the page UUID, never note text.
8. A re-import/update-in-place preserves the GM Notes flag.
9. Journal search results can display the parent-entry breadcrumb.
10. Player-visible journals are tested with the explicit understanding that flags are UI-gated, not encrypted.
