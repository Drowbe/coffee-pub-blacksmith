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


## Changing a posted card

A card is not frozen once posted. State that belongs to the card rather than to the
reader - a spent button retiring to a stamp, a pick counter counting down, a row
that has been treated - is expressed by recomposing and calling `update`.

```javascript
const card = chatCards.getCard(message);
card.parts[2].buttons = [{ label: 'Applied to Gorak', icon: 'fa-solid fa-check', variant: 'disabled' }];
await chatCards.update(message, { parts: card.parts });
```

### `update(message, options)`

| Option | Type | Notes |
|---|---|---|
| `parts` | array | Required. The new composition. |
| `theme` | string | Optional. Omit to keep the card's current theme. |
| `relativeTo` | Document | Optional enrichment context for relative `@UUID` links. |
| `flags` | object | Optional. Merged under the card's own module id. |

`message` may be a `ChatMessage` or a message id. Returns the updated message, or
`null` if the message is not a parts card, the composition is empty, or the current
user may not modify the message.

`update` rewrites the composition flag and the baked `content` together, and that is
the reason to use it rather than writing the flag yourself. A card lives in two
places: the composition, which every Blacksmith client re-renders from, and the
baked HTML in `content`, which is what chat search, exports, and clients without
Blacksmith actually show. Writing only the flag leaves `content` frozen at post
time, so the stored message and the table disagree permanently.

Permission is checked before the write, so a client that may not modify the message
gets a logged warning rather than a rejected update. In practice route updates
through the GM or the card's author rather than having every client attempt one.

Flags you already set are preserved: Foundry merges flag updates rather than
replacing them, so updating a card does not clear the state you keep beside it.
Pass `flags` only for what you want to change.

### `getCard(message)`

Returns the stored composition as `{ v, moduleId, type, theme, parts }`, or `null`
if the message is not a parts card. `message` may be a `ChatMessage` or a message id.

The result is a deep clone, so the read-splice-write cycle above cannot mutate the
document's live flags by accident - an in-place edit appears to work on the editing
client and changes nothing anywhere else.

### Which mechanism for which change

Three things look similar and are not interchangeable.

| You want | Use |
|---|---|
| Something that has actually changed, for everyone, surviving a refresh | `update` |
| Something that depends on who is looking | a render pass |
| Something that depends on state you keep elsewhere | your own flags, then `update` |

A render pass cannot record that a pick was spent: it decorates one client's DOM,
so two players in two browsers each see their own decoration and neither sees the
other's. State that stops a button firing twice has to be on the message.


## Parts

`getParts()` returns the available part ids; `CARD_PARTS` in `scripts/manager-chat-cards.js` is the definition. The library is closed - compose these, and ask for a new part rather than working around a missing one. Every part is an object with a `part` key naming it.

**Parts are named for their shape, not for what you put in them.** `tiles` is a grid of caption-over-value boxes - ability scores are one use, currency and resource counts are others. `rows` is a list of thumbnail-label-trailing rows, whether those are creatures, items, or conditions. If a part's name seems not to describe your content, that is usually the right part anyway.

| Part | Renders | Fields |
|---|---|---|
| `header` | icon and title bar | `icon`, `title` |
| `identity` | avatar, primary name, secondary line | `img`, `name`, `subtitle` |
| `subject` | one subject and how it stands: image beside a title, optional value opposite, optional bar beneath | `img`, `marker` or `index`, `title`, `value`, and one of `meter` / `gauge` |
| `image` | picture with optional caption and stacked overlays | `src`, `alt`, `caption`, `overlays: [src]` |
| `gauge` | a scale you read a position off | `min`, `max`, `stops` or `segments`, `markers`, `midpoint`, `iconStart`, `iconEnd`, `label`, `tooltip` |
| `meter` | proportional bar | `value`, `max`, `label`, `tooltip`, `tone` (`ok`/`caution`/`warn`/`danger`/`empty`; derived from the percentage if omitted, assuming low is bad) |
| `band` | full-width emphasis, centred by default | `text`, `lead`, `trail`, `icon`, `tone` (`positive`/`negative`/`info`), `size` (`large`), `quiet`, `align` (`left`/`right`) |
| `tiles` | grid of caption-over-value boxes | `items: [{ label, value }]`, `columns` (defaults to the item count, max 6) |
| `section` | divider with icon and label | `icon`, `label` |
| `prose` | structured text blocks | `blocks` (see below) |
| `pips` | discrete state slots around an optional centre marker | `groups: [{ total, filled, tone }]`, `center` (see below) |
| `rows` | thumbnail, label, optional sub-line, optional trailing value or button | `plain` (drops the box), `items: [{ img, icon, cover, ground, iconColor, overlays, marker, uuid, label, sublabel, count, trailing, trailingSize, trailingIcon, tone, emphasis, animation, action, actionIcon, value, moduleId }]` |
| `badges` | inline chips | `items: [{ icon, label }]` |
| `panel` | boxed sub-block | `icon`, `label`, `intro`, `rows: [{ icon, label, value }]` |
| `notes` | footer annotations | `items: [{ icon, text }]` |
| `actions` | instruction line and buttons | `instruction`, `layout`, `buttons: [{ action, label, icon, value, moduleId, variant, disabled }]` |
| `richtext` | document-sourced HTML | `html` (see below) |

On `rows`, supplying `uuid` turns the label into a real Foundry document link, with `label` as its display text. `count` prefixes the label; `trailing` follows it; `action` puts a button at the end.

### Bands

One shape covers every banner: a plain line, a tinted outcome banner, and a versus separator.

```javascript
{ part: 'band', text: 'DC 11' }
{ part: 'band', text: 'Stalemate', icon: 'fa-solid fa-circle-exclamation', tone: 'info', size: 'large' }
{ part: 'band', lead: 'Arcana', text: 'VS', trail: 'Arcana', tone: 'negative', quiet: true }
```

The centre may be `text`, an `icon`, or both - `{ lead: 'Arcana', icon: 'fa-solid fa-swords', trail: 'Athletics' }` is as valid as spelling out VS. An icon in the centre scales with `size`, because it sits inside the centre term rather than beside it.

`lead` and `trail` render either side of `text`, smaller and lighter so the eye reads the centre first. They
are not versus-specific: any pair of flanking terms works, and either may be omitted.

`quiet` keeps the colour and weight but drops the filled panel, which is what a separator wants. `align`
moves the whole row left or right; it is centred otherwise.

**Tones are a fixed set, and they are named for the reading rather than for any one domain.** `positive`,
`negative`, `info`, `pending`. A band saying "Encounter!" or "No Herbs!" chooses from the same four as a
saving throw does, which is why they are not called success and failure - a band tinted `failure` for a
missing ingredient reads as a bug in the card.

You cannot pass a colour to a band. Only `gauge` takes colours, and only because there the colour is the
data.

**A band is uppercased.** So is a ribbon. Those are the only two, and the line is stamps versus labels: a
stamp is read as a shape before it is read as a word, so it shouts. Titles, section labels and tile captions
render exactly as you typed them.

### Subject, and the one piece of nesting

`identity` is the chip -- avatar, name, sub-line, one line tall. `subject` is the block: the image spans two
lines, so a title and a bar sit beside it rather than under it.

```javascript
{ part: 'subject', img: actor.img, index: 1, title: 'Cyrus Bing', value: '39s',
  meter: { value: 71, max: 101 } }

{ part: 'subject', img: actor.img, marker: 'fa-solid fa-crown', title: 'Party Leader',
  gauge: { min: -100, max: 100, midpoint: 0, markers: [{ at: 45 }] } }
```

The leading marker is `index` (a number) or `marker` (a glyph), and both occupy the same width so titles line
up down a stack of subjects. Everything except `title` is optional; with no image and no bar it degrades to
a heading with a value.

**`subject` is the only part that contains another.** Its bar is a real `meter` or `gauge` rendered through
the same renderer, so it cannot drift from the standalone one. This is not general nesting: parts do not
contain parts, and rows holding gauges or panels holding rows remain out of scope. A subject carries a bar
because a subject and its standing are one idea, not because composition is recursive.

### Gauges, and who owns colour

`meter` and `gauge` look similar and are not the same part.

- **`meter`** is one value against a maximum. The colour is emphasis, so the theme owns it and you pass a `tone`.
- **`gauge`** is a scale you read a position off. The colour *is* the data, so **you** pass it.

**The rule: you may pass a colour only for data visualisation — only where the colour encodes a value.**
Nowhere else. `gauge` is currently the only such part, and `node tools/check-card-contracts.mjs` fails the
build if a colour appears in any other.

The test for which you want: would changing the colour change what the reader learns? A red HP bar and an
orange one both say the value is low. A reputation ramp is different - position along red-gold-green is the
value itself, and no fixed palette can make that judgement for your domain.

```javascript
{ part: 'gauge', min: -100, max: 100, midpoint: 0,
  stops: [{ at: -100, color: 'rgba(150, 40, 30, 0.95)' },
          { at: 0,    color: 'rgba(186, 162, 92, 0.85)' },
          { at: 100,  color: 'rgba(58, 160, 70, 0.95)' }],
  markers: [{ at: 45, tooltip: 'Docks: 45' }],
  label: 'Party reputation' }
```

Use **`stops`** for a gradient or **`segments`** for discrete blocks; segments take a `span` weight, so equal
spans give equal widths. `markers` are triangles positioned by value. Each takes `from` (`top`, the default, or `bottom`), an
optional `color` defaulting to white, and an optional `tooltip`. Two markers may sit at the same value from
opposite sides -- a current reading against a target -- because each is just under half the bar's height and
they meet rather than overlap. `midpoint` draws a tick at a value worth reading against, usually zero.

A theme may offer a palette through CSS custom properties, and `var(--your-property, fallback)` is accepted
as a colour - but a module can always drive its own.

**Colours are validated, not trusted.** Only `#hex`, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `var(--property)`
and plain keywords are accepted; anything else is dropped and logged. These values reach a `style`
attribute, so a string like `red; background-image: url(...)` would otherwise smuggle in a second
declaration. Passing colour is not passing CSS.

### Pips

Discrete slots - death saves, hit dice, charges, ammunition, legendary actions. With a centre marker the two groups fill outward from it.

```javascript
{ part: 'pips',
  center: { icon: 'fa-solid fa-skull', animation: 'pulse',
            moduleId: 'coffee-pub-yourmodule', action: 'roll-death-save',
            tooltip: 'Roll a death saving throw' },
  groups: [{ total: 3, filled: 1, tone: 'positive' },
           { total: 3, filled: 2, tone: 'negative' }] }
```

The centre is the click target; supply `action` to make it interactive, omit it for a readout. Individual pips are display-only. At most two groups are rendered.

### Animations

Any part that accepts an `animation` takes a name from a shared vocabulary: `shake-x`, `shake-y`, `pulse`, `glow`. `rows` items and a `pips` centre accept one today.

Name a **motion, never a meaning**. A critical hit is `tone: 'positive'` with `animation: 'shake-y'`, but nothing in the part knows that - the same motion is available to a crafting success or a countdown. Animations are suppressed under `prefers-reduced-motion`. New names are added centrally in `styles/cards-parts.css` and become available to every part at once.

### Row outcome states

A row can carry an outcome. `tone` is `positive`, `negative`, `info`, or `pending`, and tints the whole row. `emphasis` adds a glow and bolds the label. `trailingIcon` puts a result mark after the value. Motion is separate again - add `animation` if you want it.

```javascript
{ label: 'Kar-ahn', trailing: '21', trailingSize: 'large', trailingIcon: 'fa-solid fa-check', tone: 'positive', emphasis: true, animation: 'shake-y' }
{ label: 'Skylar',  trailing: '16', trailingSize: 'large', trailingIcon: 'fa-solid fa-check' }
{ label: 'Noodle',  trailing: '2',  trailingSize: 'large', trailingIcon: 'fa-solid fa-xmark', tone: 'negative', emphasis: true, animation: 'shake-x' }
{ label: 'Cyrus',   tone: 'pending' }
```

Say what happened and how much it matters; the part chooses the colours. Nothing in the vocabulary assumes a die was rolled - a failed import or a rejected transfer uses the same fields.

Tone and the trailing mark are independent, which is what lets one card mark every result while tinting only the exceptional ones, and another tint all of them.

Set `plain: true` on the part to drop the row boxes entirely - a conditions list reads better as icon and text than as a stack of containers.

**A thumbnail and a marker are different things.** The thumbnail is the row's picture and fills a 32px box;
the marker is a small symbol qualifying the label, like a d20 on a roll result. A row may have either, both,
or neither.

A thumbnail may carry `overlays: [src]`, stacked on the art inside the frame, exactly as the `image` part
does - a blood splatter over a portrait is the same idea at a different size.

It may also take `ground` and `iconColor`. **This is the second and only other place a caller passes a
colour**, and it passes the same test as `gauge`: on a thumbnail those colours are categorical data. A
quest's palette identifies it, and rendering it in the notes palette would tell the reader something untrue.
Both are validated like any other caller colour.

A row's thumbnail is an `img` or an `icon` - an icon standing in for a picture takes the same box, ground and edge, and fills 85% of it, so a list mixing the two still reads as one column. Supply one or the other; `img` wins if both are given.

Every image in a card sits on a subtle ground pitched at the tile fill. Opaque art covers it and nothing shows; transparent art - which most token and item icons are - lands on it rather than dissolving into the card. You do not ask for this and there is no flag: it just happens.

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
      icon: 'fa-solid fa-check', value: transferId, variant: 'primary' }
] }
```

### Button weight

`variant` is one of `primary`, `secondary` or `critical`, and defaults to `secondary`.
Any other value is treated as `secondary`. The names match the window buttons in
`styles/window-template.css`, so one vocabulary covers both surfaces.

`secondary` is outlined. `primary` fills with the colour `secondary` writes in, so it
follows whichever card theme is active. `critical` fills dark red. A button carrying
`disabled` renders at reduced opacity with a not-allowed cursor, matching the window
buttons.

The primary button renders as the rightmost button regardless of its position in the
array. Position is not a caller decision.

### Row layout

`layout` on the part is `inline` or `stacked`, and defaults to `inline`. Any other
value is treated as `inline`.

`inline` places buttons side by side, reflowing onto another line when they do not
fit. `stacked` gives each button its own full-width row, which suits a list of
alternatives rather than a confirm/cancel pair. A button never wraps its label in
either layout.

The primary button is last in both, so changing the layout does not move it.

The handler receives `{ message, value, event, button }`. A chat message is data on every client, so handlers cannot travel with the card - each client resolves them from its own registry at render time. This is why registration belongs in `ready` rather than alongside the post, and why buttons keep working after a browser reload.

`unregisterAction(moduleId, action)` removes one. `getRegisteredActions()` lists what is registered, for diagnostics.

## Tooltips

A bar reports a number by hiding it -- the reader sees a proportion and never the figures. Both bar parts take tooltips, at the level that matches what is being explained.

- `meter` takes `tooltip` on the part. **It defaults to `value / max`**, so the numbers are always one hover away without a caller thinking of it. Pass your own to say something better.
- `gauge` takes `tooltip` on the part, for what the scale MEANS -- red-to-green does not say which end is which.
- `gauge` segments each take a `tooltip`, for what a discrete band means. A gradient built from `stops` has no bands, so it explains itself on the part instead.
- `gauge` markers each take a `tooltip`, for what that one position is.
- `rows` items each take a `tooltip`, on the row. For a row that reports a number, it explains the number; for a clickable row, it says what clicking does.

A row tooltip is used as supplied rather than run through the text pipeline, so it takes HTML directly - enrich it yourself if you want a document's description in there. That is the one place in the card vocabulary where consumer HTML is passed through, and it is deliberate: a tooltip is Foundry's own surface, not part of the card body.

Use `data-tooltip` semantics: a tooltip explains a value already on screen or supplies one the shape is hiding. It is not a place to put something the reader needs to see.

## Literal values

Anywhere a part accepts consumer text, it also accepts `{ literal }`: escaped and
shown exactly as given, never read as marks and never enriched.

Use it for text you did not author - an item name, an actor name, anything a user
typed that you interpolate into a sentence. Those are the strings you cannot vet,
and the ordinary pipeline reads them: an item called `Ring of *Power*` italicises
the rest of your sentence, and a name containing `@UUID[...]` or `[[/r 1d20]]`
reaches the enricher and is obeyed.

```javascript
{ label: { literal: item.name } }
```

A text field also accepts an ARRAY of segments, each processed on its own and
joined. That is how you mark up the words you wrote while passing a name through
untouched:

```javascript
{ type: 'paragraph', text: ['Created ', { literal: item.name }, ' for **the party**'] }
```

Marks and enricher syntax cannot span a segment boundary. That is the guarantee
rather than a limitation - a literal must not be able to close a run its neighbour
opened.

**So a mark must open and close inside ONE segment, and an untrusted value cannot
be emphasised.** Wrapping a literal in marks from the neighbouring segments does
not make it bold; it renders the asterisks:

```javascript
// Wrong - renders: Created Ring of Power for **Bob**
['Created ', { literal: item.name }, ' for **', { literal: actor.name }, '**']
```

There is no way around this, and there should not be: emphasis is markup, and
markup is the thing a literal exists to withhold. Where a name needs to stand out,
give it a part that carries weight of its own - a `rows` label, a `subject`, a
trailing value - rather than marks inside a sentence.

Do not strip characters from a name before passing it. That renders a name which is
not the name, and does nothing about enricher syntax.

To veil a literal, nest it: `{ value: { literal: name }, readableBy: 'gm' }`. A
`readableBy` alongside `literal` is treated as that nesting rather than ignored.

## Veiled values

Anywhere a part accepts consumer text, it also accepts a veiled form: a value shown to entitled readers and replaced by a placeholder for everyone else.

```javascript
{ part: 'rows', items: [
    { label: 'Favia Gita',
      trailing: { value: '18', readableBy: 'owner', actorId: actor.id } }
] }
```

- `value` - what an entitled reader sees. Goes through the same escape, marks and enrich pipeline as any other text.
- `readableBy` - `'gm'`, `'player'`, `'owner'`, `'author'`, or an array of user ids. Any other value is treated as readable by nobody.
- `actorId` - required by `'owner'`, which resolves against the actor's ownership. A GM owns every actor, so `'owner'` reads as "the GM and the owning player".
- `veil` - optional. A Font Awesome class renders as an icon; anything else is escaped and shown as text. Defaults to an eye icon.

Only the field carrying it is veiled. The `label` beside a veiled `trailing` stays visible to every reader.

`'player'` is the complement of `'gm'`, for a card that says one thing to the GM and
another to everyone else - a linked adversary list against a plain one. The two are
complements at render time only: both fail closed in the stored snapshot, so a card
built from a `'gm'`/`'player'` pair shows neither half until a client re-renders it.
Keep anything the card cannot do without out of that pair.

A whole part can carry `readableBy` too, for a block only some readers should see:

```javascript
{ part: 'actions', readableBy: 'gm', buttons: [{ action: 'close-vote', label: 'Close Vote' }] }
```

Same rules and the same caveat: it decides what renders, never what travels. Hiding a button is not authorisation - check the permission in the action handler as well, because any client can fire an action whatever its copy of the card looks like.

Resolution happens in each reader's own browser when the card re-renders, so one message shows different things on different screens. The snapshot stored on the message is always rendered veiled, whoever posted it, because that copy is delivered to everybody and is what a client shows until its own re-render lands.

**A veil is presentation, not secrecy.** The value travels to every client inside the message flags, because that is how the card re-renders, and a reader with a browser console can find it. A veil stops a value appearing on screen. It does not keep a secret. Anything that must not reach a client at all belongs in a whispered message instead, which is a property of the message rather than of a part.

## Render passes

Some things cannot be composed, because they depend on who is looking: which row is the reader's own vote, which characters they may roll for, which label is truncated on their screen. A composition is written once and read by everybody.

```javascript
chatCards.registerRenderPass('coffee-pub-yourmodule', 'own-choice', ({ message, card, root }) => {
    // `root` is the .blacksmith-card element, freshly rendered for THIS client.
});
```

Use this rather than a `renderChatMessageHTML` hook. A parts card re-renders from its stored composition a tick after Foundry paints it, and that swap replaces the card element - anything a hook decorated is silently discarded. Passes run after the initial paint and after every re-render.

A pass must be **idempotent**: it can run more than once on the same card, so guard anything it appends. One pass throwing does not stop the others.

`unregisterRenderPass(moduleId, name)` removes one.

## Themes

Themes set colour only; structure comes from parts.

Each colour comes in two: the ordinary theme, and a `-dark` variant -- `red` and
`red-dark`, `blue` and `blue-dark`, and so on. A `-dark` variant changes one thing,
the card header, which it fills with a dark ground and light text. Everything else
on the card is identical to the ordinary theme. It suits a card that is little more
than a header; a full card in a `-dark` variant simply has a banner across the top.

- `getThemes([type])` - theme objects, optionally filtered by type. Every theme is currently type `'card'`.
- `getThemeChoices([type])` - id-to-name map for a settings dropdown.
- `getTheme(themeId)` - one theme, or null.

Pass a theme **id** to `post`. Omitting `theme` uses the world default, resolved when the card is posted.

Several class-name accessors (`getThemeClassName`, `getThemeChoicesWithClassNames`, and their card variants) remain for modules that still build their own card HTML. They exist for the migration and nothing new should use them - a card posted through `post` never needs a class name.

## Notes

- `post` is async and must be awaited if you depend on the returned message.
- Cards store their composition on the message, so improving a part improves cards that already exist.
- Blacksmith owns the card wrapper, the theme class, and the message header handling. Do not add your own.
