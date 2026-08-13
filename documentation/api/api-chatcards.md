# Chat Cards API

**Audience:** Developers building on Blacksmith who need to post chat cards.

How to post a themed chat card by describing it as data. You do not write card HTML; you name a composition of parts and supply their content. How the system is built is in `../architecture/architecture-chatcards.md`.

## Accessing the API

```javascript
const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
if (!chatCards) return;
```

## Posting a card

```javascript
await chatCards.post({
    moduleId: 'coffee-pub-yourmodule',
    type: 'loot-drop',
    parts: [
        { part: 'header', icon: 'fa-solid fa-coins', title: 'Loot Dropped' },
        { part: 'prose', blocks: [
            { type: 'paragraph', text: '**Gorak** has been defeated and dropped their belongings.' }
        ] }
    ]
});
```

### `post(options)`

| Option | Type | Notes |
|---|---|---|
| `moduleId` | string | Required. Your module id. |
| `parts` | array | Required. The composition, in render order. |
| `type` | string | Optional. Your own card type id, stored on the message. |
| `theme` | string | Optional theme id. Omit to use the world default. |
| `relativeTo` | Document | Optional enrichment context for relative `@UUID` links. |
| `whisper` | array | Optional user ids. Omit for a public card. |
| `speaker` | object | Optional. Defaults to the current user. |
| `rollMode` | string | Optional Foundry roll mode. |
| `flags` | object | Optional. Merged under your module id on the message. |

Returns the created `ChatMessage`, or `null` if posting failed.

`postAnnouncement(options)` is the same call with an announcement theme by default.

## Parts

`getParts()` returns the available part ids; `CARD_PARTS` in `scripts/manager-chat-cards.js` is the definition. The library is closed - compose these, and ask for a new part rather than working around a missing one. Every part is an object with a `part` key naming it.

| Part | Fields |
|---|---|
| `header` | `icon`, `title` |
| `actor` | `img`, `name`, `subtitle` |
| `image` | `src`, `alt`, `caption` |
| `meter` | `value`, `max`, `label`, `tone` (`ok`/`warn`/`danger`; derived if omitted) |
| `nameplate` | `text` |
| `stats` | `items: [{ label, value }]` |
| `section` | `icon`, `label` |
| `prose` | `blocks` (see below) |
| `entities` | `items: [{ img, uuid, label, count }]` |
| `status` | `items: [{ img, icon, label, sublabel, trailing, action, actionIcon, value, moduleId }]` |
| `badges` | `items: [{ icon, label }]` |
| `panel` | `icon`, `label`, `rows: [{ icon, label, value }]` |
| `notes` | `items: [{ icon, text }]` |
| `actions` | `instruction`, `buttons: [{ action, label, icon, value, moduleId, disabled }]` |
| `richtext` | `html` (document-sourced only - see below) |

On `entities`, supplying `uuid` renders a real Foundry document link; `label` becomes its display text.

## Prose

The `prose` part takes structured blocks rather than an HTML string, so Blacksmith owns how a list or table looks inside a card.

```javascript
{ part: 'prose', blocks: [
    { type: 'paragraph', text: 'A figure shifts position just ahead.' },
    { type: 'list', items: ['Mutual awareness', 'A brief pause'], ordered: false },
    { type: 'table', rows: [['Coins', '3 gp'], ['Weight', '12 lb']] },
    { type: 'quote', text: 'The moment stays safe.' }
] }
```

### Text, marks, and links

Text fields accept three inline marks and Foundry's enricher syntax:

- `**bold**`, `*italic*`, `` `code` ``
- `@UUID[Actor.abc]{Ogre}`, `[[/r 1d20]]`, `@Check[dexterity]`

```javascript
{ type: 'paragraph',
  text: 'You see an @UUID[Actor.ogre123]{Ogre} with a big stick. ' +
        'They hit you on the head **3 times** with the stick.' }
```

**HTML is not accepted.** Text is escaped before anything else touches it, so `<b>x</b>` renders as those visible characters, not as bold. This is enforced at runtime, not by convention. Block syntax beyond the three marks is not markdown and is not supported - use the block types above.

### `richtext`, for content out of a document

Use `richtext` only for HTML that already exists in a Foundry document - a journal page, a roll-table description, an editor field:

```javascript
{ part: 'richtext', html: journalPage.text.content }
```

It is enriched and scoped to card typography. Building an HTML string in JavaScript and passing it here defeats the system; pass structured prose instead.

## Buttons

Register handlers at startup, on every client - not at post time, and not only on the GM:

```javascript
Hooks.once('ready', () => {
    const chatCards = game.modules.get('coffee-pub-blacksmith')?.api?.chatCards;
    chatCards?.registerAction('coffee-pub-yourmodule', 'accept', async ({ message, value }) => {
        await acceptTransfer(value);
    });
});
```

Then reference the action when composing:

```javascript
{ part: 'actions', instruction: 'Choose one.', buttons: [
    { moduleId: 'coffee-pub-yourmodule', action: 'accept', label: 'Accept',
      icon: 'fa-solid fa-check', value: transferId }
] }
```

The handler receives `{ message, value, event, button }`. A chat message is data on every client, so handlers cannot travel with the card - each client resolves them from its own registry at render time. This is why registration belongs in `ready` rather than alongside the post, and why buttons keep working after a browser reload.

`unregisterAction(moduleId, action)` removes one. `getRegisteredActions()` lists what is registered, for diagnostics.

## Themes

Themes set colour only; structure comes from parts.

- `getThemes([type])` - theme objects, optionally filtered by `'card'` or `'announcement'`.
- `getThemeChoices([type])` - id-to-name map for a settings dropdown.
- `getTheme(themeId)` - one theme, or null.

Pass a theme **id** to `post`. Omitting `theme` uses the world default, resolved when the card is posted.

Several class-name accessors (`getThemeClassName`, `getThemeChoicesWithClassNames`, and their card and announcement variants) remain for modules that still build their own card HTML. They exist for the migration and nothing new should use them - a card posted through `post` never needs a class name.

## Notes

- `post` is async and must be awaited if you depend on the returned message.
- Cards store their composition on the message, so improving a part improves cards that already exist.
- Blacksmith owns the card wrapper, the theme class, and the message header handling. Do not add your own.
