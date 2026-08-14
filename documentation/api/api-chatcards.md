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

**Parts are named for their shape, not for what you put in them.** `tiles` is a grid of caption-over-value boxes - ability scores are one use, currency and resource counts are others. `rows` is a list of thumbnail-label-trailing rows, whether those are creatures, items, or conditions. If a part's name seems not to describe your content, that is usually the right part anyway.

| Part | Renders | Fields |
|---|---|---|
| `header` | icon and title bar | `icon`, `title` |
| `identity` | avatar, primary name, secondary line | `img`, `name`, `subtitle` |
| `image` | picture with optional caption and stacked overlays | `src`, `alt`, `caption`, `overlays: [src]` |
| `meter` | proportional bar | `value`, `max`, `label`, `tone` (`ok`/`caution`/`warn`/`danger`/`empty`; derived from the percentage if omitted, assuming low is bad) |
| `band` | full-width centred emphasis | `text`, `lead`, `trail`, `icon`, `tone` (`success`/`failure`/`tie`), `size` (`large`), `quiet` |
| `tiles` | grid of caption-over-value boxes | `items: [{ label, value }]`, `columns` (defaults to the item count, max 6) |
| `section` | divider with icon and label | `icon`, `label` |
| `prose` | structured text blocks | `blocks` (see below) |
| `pips` | discrete state slots around an optional centre marker | `groups: [{ total, filled, tone }]`, `center` (see below) |
| `rows` | thumbnail or icon, label, optional sub-line, optional trailing value or button | `plain` (drops the box), `items: [{ img, framed, cover, icon, uuid, label, sublabel, count, trailing, trailingSize, trailingIcon, tone, emphasis, animation, action, actionIcon, value, moduleId }]` |
| `badges` | inline chips | `items: [{ icon, label }]` |
| `panel` | boxed sub-block | `icon`, `label`, `intro`, `rows: [{ icon, label, value }]` |
| `notes` | footer annotations | `items: [{ icon, text }]` |
| `actions` | instruction line and buttons | `instruction`, `buttons: [{ action, label, icon, value, moduleId, disabled }]` |
| `richtext` | document-sourced HTML | `html` (see below) |

On `rows`, supplying `uuid` turns the label into a real Foundry document link, with `label` as its display text. `count` prefixes the label; `trailing` follows it; `action` puts a button at the end.

### Bands

One shape covers every banner: a plain line, a tinted outcome banner, and a versus separator.

```javascript
{ part: 'band', text: 'DC 11' }
{ part: 'band', text: 'Stalemate', icon: 'fa-solid fa-circle-exclamation', tone: 'tie', size: 'large' }
{ part: 'band', lead: 'Arcana', text: 'VS', trail: 'Arcana', tone: 'failure', quiet: true }
```

`lead` and `trail` render small and muted either side of `text`, so the eye reads the centre first. `quiet` keeps the colour and weight but drops the filled panel, which is what a separator wants.

### Pips

Discrete slots - death saves, hit dice, charges, ammunition, legendary actions. With a centre marker the two groups fill outward from it.

```javascript
{ part: 'pips',
  center: { icon: 'fa-solid fa-skull', animation: 'pulse',
            moduleId: 'coffee-pub-yourmodule', action: 'roll-death-save',
            tooltip: 'Roll a death saving throw' },
  groups: [{ total: 3, filled: 1, tone: 'success' },
           { total: 3, filled: 2, tone: 'failure' }] }
```

The centre is the click target; supply `action` to make it interactive, omit it for a readout. Individual pips are display-only. At most two groups are rendered.

### Animations

Any part that accepts an `animation` takes a name from a shared vocabulary: `shake-x`, `shake-y`, `pulse`, `glow`. `rows` items and a `pips` centre accept one today.

Name a **motion, never a meaning**. A critical hit is `tone: 'success'` with `animation: 'shake-y'`, but nothing in the part knows that - the same motion is available to a crafting success or a countdown. Animations are suppressed under `prefers-reduced-motion`. New names are added centrally in `styles/cards-parts.css` and become available to every part at once.

### Row outcome states

A row can carry an outcome. `tone` is `success`, `failure`, `tie`, or `pending`, and tints the whole row. `emphasis` adds a glow and bolds the label. `trailingIcon` puts a result mark after the value. Motion is separate again - add `animation` if you want it.

```javascript
{ label: 'Kar-ahn', trailing: '21', trailingSize: 'large', trailingIcon: 'fa-solid fa-check', tone: 'success', emphasis: true, animation: 'shake-y' }
{ label: 'Skylar',  trailing: '16', trailingSize: 'large', trailingIcon: 'fa-solid fa-check' }
{ label: 'Noodle',  trailing: '2',  trailingSize: 'large', trailingIcon: 'fa-solid fa-xmark', tone: 'failure', emphasis: true, animation: 'shake-x' }
{ label: 'Cyrus',   tone: 'pending' }
```

Say what happened and how much it matters; the part chooses the colours. Nothing in the vocabulary assumes a die was rolled - a failed import or a rejected transfer uses the same fields.

Tone and the trailing mark are independent, which is what lets one card mark every result while tinting only the exceptional ones, and another tint all of them.

Set `plain: true` on the part to drop the row boxes entirely - a conditions list reads better as icon and text than as a stack of containers.

Set `framed: true` on an item to put a dark ground and light border behind its thumbnail. Token art is usually transparent PNG drawn against a dark canvas, so on a light card it needs something behind it; item and portrait art usually does not.

Set `cover: true` for a character portrait, which crops square. Thumbnails otherwise fit the whole image, because cropping token and item art removes the parts that carry it.

Set `trailingSize: 'large'` when the trailing value is the point of the row rather than an annotation on it - a roll total rather than an XP award. It renders larger and in the slab face.

On `panel`, `label` is the bold lead and `intro` is prose that follows it on the same line ("**Treatment**: Cool your wounds by..."). Each row is a flowing line of icon plus statement, not a label/value column.

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

Text fields accept two inline marks and Foundry's enricher syntax:

- `**bold**` and `*italic*`
- `@UUID[Actor.abc]{Ogre}`, `[[/r 1d20]]`, `@Check[dexterity]`

```javascript
{ type: 'paragraph',
  text: 'You see an @UUID[Actor.ogre123]{Ogre} with a big stick. ' +
        'They hit you on the head **3 times** with the stick.' }
```

**HTML is not accepted.** Text is escaped before anything else touches it, so `<b>x</b>` renders as those visible characters, not as bold. This is enforced at runtime, not by convention. Block syntax beyond the two marks is not markdown and is not supported - use the block types above.

There is no inline code mark; a backtick is an ordinary character. Chat cards do not have inline code in practice, and carrying an unused mark meant carrying the machinery that protected it.

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
