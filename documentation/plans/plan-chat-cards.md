# Plan: Chat Cards

**Status: Implemented through step 3, unverified in a live world beyond a first smoke test.** The parts
library, the renderer, the posting API, the action dispatcher, and Blacksmith's simple cards are built; steps
4 to 7 are not. What is owed before this plan can be dismantled is in
`testing/chat-cards.md`.

The inventory in "What exists today" was gathered from code on 2026-08-13 and is evidence, not design. The
design starts at "Decisions".

## The gate

**If a consuming module still writes card HTML, this has failed.** Not "writes less HTML" -- writes any.
Every previous attempt at this problem shipped a helper that modules called *alongside* their own templates,
and the drift continued because the templates were still there.

**Test: delete every card template in every sibling module. Does the suite still render every card?** If the
answer is no, the parts library is missing a part, and the answer is to add the part -- never to let the
module keep its template.

## What the author asked for

- Each module gets out of the business of creating its own chat designs.
- A module passes its data and the kind of card it needs; Blacksmith does the rest.
- Improve a card and every module benefits with no work on their side.
- When Foundry changes, only Blacksmith deals with it.
- Themes sit on top of card structure and are largely color.
- Every card goes through this system, starting with Blacksmith's own.
- Code and CSS come out clean and optimized -- years of hacks and drift get removed.
- Backwards compatibility is explicitly not a goal. Every module migrates.

## What exists today

84 posting sites across the suite, 21 card templates, and five modules writing card HTML inline in JS.

| Module | Posting sites | Card templates | Card CSS |
|---|---|---|---|
| Blacksmith | 31 | 15 files, 1,477 lines | 1,948 lines |
| Squire | 26 | 1 file, 505 lines | none |
| Bibliosoph | 10 | 2 files | none |
| Artificer | 7 | 2 files | 5 rules |
| Crier | 4 | inline HTML | 59 rules over Blacksmith classes |
| Scribe | 3 | inline HTML | own theme system, 7 files |
| Regent | 2 | inline HTML | 4 rules |
| Curator | 1 | 1 file | none |

Cartographer, Herald, Minstrel, Monarch, and Vault post no chat cards.

Three findings shape the design:

**The fork.** `templates/cards-common.hbs` (324 lines) and Squire's `templates/chat-cards.hbs` (505 lines)
are the same file, forked. Same variant names in the same order, same invalid `visibility: none` on line 1.
231 lines now differ: Squire grew variants Blacksmith lacks (`isRoundAnnouncement`, `isGMApproval`, a
transfer-request-rejected block), and identical cards drifted in wording -- Blacksmith renders
"GM Notification: The transfer of...", Squire renders "The transfer of...". Both describe the same transfer.

**Missing parts, not rogue designs.** Artificer conforms to the documented contract and adds exactly four
local classes -- `gather-result-list/item/img/content` -- because it needed rows of item-image-plus-name and
no such part exists. That is the system failing the module, not the module going its own way.

**Three root contracts are live, one is documented.** `.blacksmith-card` (documented), legacy
`.cpb-chat-card` (skill-check and XP cards), and `.vote-card` (`templates/vote-card.hbs`, its own structure
entirely). Scribe uses none of them -- it posts a raw `<blockquote>` and carries six theme files of its own,
a second theming layer competing with Blacksmith's.

## Decisions

### 1. A parts library, not a catalog of card templates

The first shape considered was a fixed set of card types (notice, details, entities, request, and so on).
The author's reference cards killed it: the cards in the wild are compositions of recurring blocks, and any
fixed catalog either misses combinations or grows a template per combination, which is where we already are.

**Blacksmith owns a library of parts. A card is a declared composition of parts plus its data.** Adding a
card means composing existing parts; adding a *part* is the rare event that needs Blacksmith code.

The model to copy is the Pins API (`scripts/api-pins.js`): `create(pinData)` takes data and Blacksmith
renders it; `registerPinType(moduleId, type, friendlyName)` lets modules declare types alongside built-ins.
Menubar is the wrong model -- its registrations hold live callbacks in the registering module's memory, and
a chat message must re-render on every client, forever, including clients where that module is not
installed. The Window API is the wrong model and says so in its own documentation: "Blacksmith does not
inject content into your template." Consumers owning their body markup is precisely the arrangement being
removed.

### 2. Cards store data; HTML is a baked fallback

A card writes **card type, composition, and data into message flags**, and **bakes a rendered snapshot into
`content`**. Blacksmith re-renders from flags at display time whenever they are present; the baked HTML is
what remains if Blacksmith is absent, and it is what Foundry's chat search indexes.

Storing HTML alone -- what happens today -- cannot deliver two of the author's requirements. Every card
already in the log keeps its old markup forever, so improving a part improves nothing that exists; and a
Foundry change that breaks card markup breaks all of chat history, not just new messages.

Storing data alone fails differently: disabling Blacksmith blanks every card in the log, and search stops
finding card text. The hybrid costs one render per display and a few kilobytes of flags per message.

### 3. One posting call, routed through the existing wrapper

`chatCards.post(options)` wraps `ChatMessage.create` and owns the envelope, the theme class, the header-hide
mechanism, the message-shape fields (`style`, `speaker`, `whisper`), and the flags. `postAnnouncement` is the
same call defaulted to an announcement theme.

It must route **through** `manager-libwrapper.js:102`, not around it. That wrapper already intercepts
`ChatMessage.create`, stamps `isCoffeePubCard` and `removeChatCardPadding`, and fires the
`preCoffeePubChatMessage` hook. A posting API that bypassed it would give API-posted cards different flags
than directly-posted ones during the migration window, when both will exist.

Centralizing here is also the answer to the Foundry-churn requirement: the v12 `type` to `style` rename was
fixed at four sites in July and **six sites still pass `type:`** today (`token-movement.js` x4,
`xp-manager.js` x2). With one sender there is one site.

### 4. Actions register at startup, not at post time

A ChatMessage is data on every client, so a callback cannot ride the document. Modules register card actions
at startup by module id and action name; Blacksmith owns a single delegated `renderChatMessageHTML` listener
that matches markup to registered handlers, and every client re-resolves on render. Same receipt-side model
as toast callbacks never crossing the socket.

The dispatcher uses namespaced attributes of its own. It must not claim `data-action`, which Foundry's
ApplicationV2 already uses. Note that `data-action` is documented as our button contract today and **is used
by no chat template in the suite** -- real cards use `.vote-button` with `data-option-id`,
`.transfer-request-button` with `data-transfer-id`, `.cpb-skill-check-actor` with `data-actor-id`. The
documented contract is aspirational, so nothing is lost by choosing different attributes.

This absorbs the per-module `renderChatMessageHTML` plumbing that exists today in `blacksmith.js` (skill
check), `manager-vote.js` (vote), and each sibling.

### 5. Themes are color, and `theme-default` stops being a lie

Parts define structure; themes set color and nothing else. A part looks the same in every theme.

`theme-default` is currently a sentinel, not a color: `blacksmith.js:2284` rewrites every
`.blacksmith-card.theme-default` on screen to the world's `defaultCardTheme` setting. So a consumer cannot
pin a card to Tan, and `getThemeClassName('typo')` falls back to `theme-default` and silently becomes
whatever the GM chose. Neither doc mentions this.

Under the new system the world default is resolved **at post time, in one place**, and the stored theme is
always a real theme. The render-time rewrite hook is deleted.

### 6. One root contract

`.cpb-chat-card` and `.vote-card` go. Every card roots at `.blacksmith-card` with a theme class. The legacy
selectors in `styles/cards-skill-check.css` and the `.vote-card` block are removed once their cards are
composed from parts.

### 7. Stats cards become a card plus a window

Round and combat summaries collapse to key data plus a "View Details" button opening a dashboard window;
combat is the aggregate of round. This removes the hardest layout problem from the card system entirely --
8 templates and ~540 lines of `cards-stats.css` become a window's concern, which is a different API that
already exists.

**Sequenced second, not first.** After simplification the stats card is trivial -- a few data rows and a
button -- so it is no longer a case worth sequencing around. Built first, the card-to-window handoff would be
constructed against a card system that does not exist yet and then rebuilt.

### 8. No backwards compatibility

Confirmed by the author. The old theme-only helpers, the legacy roots, and every module template are removed
rather than deprecated. This is what makes the CSS cleanup possible in one pass instead of never.

Legacy cards already in a chat log are **not** catered for. No legacy CSS is preserved to keep chat history
looking right; old messages degrade. The author's reason is that the Foundry chat log is a primary cause of
world performance collapse and everyone clears it regularly, so history is not a durable artifact worth
constraining the design around.

### 9. Rich text: structured blocks, inline marks, and a separate document-sourced part

The question this answers: consumers will want lists, bold, tables, and quotes in their prose, but "modules
pass HTML" reopens the drift the whole plan exists to close.

Framing it as "HTML or markdown" is the wrong split. Prose has two provenances and they need different
doors.

**`prose` takes structured blocks, not a string.**

```js
prose: [
  { type: 'paragraph', text: 'A figure shifts position just ahead.' },
  { type: 'list', items: ['Mutual awareness', 'Brief pause'] },
  { type: 'table', rows: [['Coins', '3 gp - 25 sp'], ['Weight', '12 lb']] },
  { type: 'quote', text: 'You keep swallowing to clear ears that were never blocked.' }
]
```

Lists, tables, and quotes arrive as data, so Blacksmith owns what a list looks like inside a card. Accepting
`<ul>` instead would mean every module's list looks like whatever its own CSS does, which is the current
failure restated.

**Inline marks only, inside the text strings.** Bold and italic -- two marks -- plus Foundry
enricher syntax (`@UUID[]`, `[[/r 1d20]]`, `@Check[]`). This is deliberately not "we support markdown":
markdown's block syntax (headings, tables, lists) and its raw-HTML passthrough are exactly the side door
that lets structure back in. An inline-only subset cannot express layout.

Enricher syntax must survive intact, because it is where several reference cards get their content:
`manager-encounters.js:678` in Bibliosoph emits `@UUID[uuid]{name}` for the encounter card's adversary list,
and `manager-inspiration.js:109` does the same for the inspiration card. Those pills are Foundry's output,
not our markup, and enrichers run only on HTML.

**Processing order, which is load-bearing:**

1. Escape HTML (`<`, `>`, `&`).
2. Convert the inline marks to `<strong>` and `<em>`.
3. Run `enrichHTML`.
4. Insert into the part's container.

Escaping first makes "no HTML" **enforced at runtime, not by review**. A module that passes `<b>3 times</b>`
sees the literal text `<b>3 times</b>` on the card -- a visible, self-correcting failure rather than a silent
success. Escaping does not damage the syntax we want, since `@`, `[`, `]`, `{`, `}` are not HTML-special.

Step 2 is ours and has to be: Foundry does not support markdown and will not. Verified by the author on
2026-08-13 -- posting `You see an @UUID[...]{Ogre} ... **3 times**` directly to Foundry chat renders the
Ogre pill correctly and the literal characters `**3 times**`. Foundry performs step 3 only; steps 1 and 2
exist nowhere else, which is also why mark conversion must be central rather than reimplemented per module.

**`richtext` is a separate part, for document-sourced HTML only.** Scribe's journal snippet, GM Notes,
Regent's output, roll-table descriptions such as the Critical Hit and Fumble text. That content already
exists as ProseMirror HTML in world data and cannot be asked to emit structured blocks. It runs through
`enrichHTML` plus a tag whitelist and renders inside a scoped container.

The part is named for provenance rather than capability so the gate stays enforceable: passing
`journalPage.text.content` is correct use; building an HTML string in JS and passing it is the violation, and
that distinction is visible on sight in review in a way that "we allow some HTML" never is.

**Markdown as the transport was rejected on evidence.** Bibliosoph already built it --
`manager-conversations.js:849`, commented "Markdown to enriched HTML" -- and it converts markdown to HTML and
then enriches. Markdown did not remove the HTML step; it added one in front of it. Foundry's content layer is
ProseMirror HTML end to end.

**Known cost.** `enrichHTML` is async, so re-rendering from flags at display time puts async work inside a
render hook: a card paints and its pills resolve a tick later. The baked snapshot means first paint is never
blank. If the pop-in looks wrong in practice, the fallback is to enrich at post time and re-enrich only when
the composition changes.

## Decision 10: parts are named for their shape

Added 2026-08-13, after the first live render.

The catalog below was first written with names taken from the reference card each part was found in --
`stats` for the ability-score grid, `status` for the conditions list, `actor` for the character chip. Two of
those were wrong within a day: `status` was carrying monsters and player awards in the XP card, and `actor`
was carrying "Game Master / Cocktail Craftsman" on the crit card.

**A part is named for what it looks like, never for what a caller might put in it.** `tiles` is a grid of
caption-over-value boxes; `rows` is a list of thumbnail-label-trailing rows. The renames were `stats` to
`tiles`, `actor` to `identity`, `nameplate` to `band`, and `status` to `rows`.

The same test collapsed two parts into one. `entities` and `status` were the same shape -- a row with a
thumbnail, a label, and something trailing -- differing only in which optional fields were filled. They are
now one `rows` part, where a `uuid` makes the label a document link, `count` prefixes it, `trailing` follows
it, and `action` puts a button at the end. Fourteen parts rather than fifteen.

This matters more for a **closed** library than it would for an open one. A use-case name invites the next
caller either to misuse it or to ask for a near-duplicate part, and granting those requests is how a closed
library stops being closed.

## Decision 11: cards do not collapse

Settled by the author 2026-08-13, after Foundry's own item and attack cards were compared against ours.

**If it is important enough to include, it is important enough to see.** There is no collapsible part, and
none is planned.

The author had previously supported collapsing and withdrew it on evidence: players did not expand collapsed
content, Foundry ships its cards expanded by default so a weapon roll narrates everything about the weapon
and nobody reads it, and nobody discovered the world setting that would have posted cards collapsed instead.
A control nobody uses is not a feature.

The one case that survives is midi-qol's -- hiding *how a number was calculated* behind an affordance. That
is served by `data-tooltip`, not by collapsing a section.

This also settles a question step 4 would otherwise have answered twice. The statistics cards get a "View
Details" button opening a window, and that is the answer to "this content is too long for a card". Expanding
in place is not a second answer to the same question.

**Consequence, already applied:** the collapsible CSS in `styles/cards-common-layout.css` -- 63 lines across
`.collapsible-content`, `.section-content.collapsed`, `.collapsible .summary`, and `.card-header.collapsible`
-- had no caller in any module and is deleted.

## The parts catalog

Derived from nine reference cards supplied by the author (Crier turn card, Bibliosoph no-encounter,
encounter, investigation, critical hit, fumble, injury, check-up, inspiration) and reconciled against all 84
posting sites.

| Part | Renders | Seen in |
|---|---|---|
| `header` | icon and title bar | every card |
| `identity` | avatar, primary name, secondary line | encounter, investigation, crit, fumble, check-up, inspiration |
| `image` | banner or portrait, optional caption | turn card, encounter, crit, fumble, injury, inspiration |
| `meter` | proportional bar | turn card, check-up |
| `band` | full-width emphasised text | turn card |
| `tiles` | grid of caption-over-value boxes | turn card (ability scores) |
| `section` | icon, uppercase label, rule | nearly all |
| `prose` | structured blocks: paragraph, list, table, quote (decision 9) | nearly all |
| `richtext` | document-sourced HTML, enriched (decision 9) | journal snippets, roll-table text |
| `rows` | thumbnail or icon, label, optional sub-line, optional count, trailing value, or button (decision 10) | encounter adversaries, investigation items, turn card conditions, check-up |
| `badges` | standalone state chips ("Poisoned for 4 rounds") | fumble, injury |
| `panel` | boxed sub-block with icon rows (Treatment) | injury |
| `notes` | icon and footer note ("added to inventory") | investigation, injury, inspiration |
| `actions` | instruction line and buttons | crit, fumble |

Fourteen parts compose all nine reference cards. Two checks that the set is sufficient:

- Crier's turn card is `header + image + meter + nameplate + stats + section + status`. Its 59 CSS overrides
  exist because those parts were unavailable, and go when they are.
- Scribe's journal-snippet-to-chat -- the one genuinely new capability found in the sweep -- is
  `header + image + prose + actions`. It needs no new part, and Scribe's six theme files go.

Where a reference card cannot be composed, **add the part**. Never let a module keep a template.

## Migration order

Blacksmith first, per the author. Each step is verified in a live world before the next begins.

1. **Parts library, renderer, and `post()`** -- the foundation, with flags-plus-snapshot storage and the
   world-default theme resolved at post time.
2. **Action registration and the delegated dispatcher.**
3. **Blacksmith's simple cards** -- notice, details, entities, request. Retires `cards-common.hbs`.
4. **Stats simplification** -- key-data card plus dashboard window. Retires 8 templates and `cards-stats.css`.
5. **Blacksmith's interactive cards** -- skill check and vote. Retires `.cpb-chat-card` and `.vote-card`.
6. **CSS consolidation** -- one layout file and one theme file; the five card CSS files collapse.
7. **Siblings**, easiest first: Curator, Regent, Artificer, Crier, Bibliosoph, Scribe, Squire.

Steps 1 through 6 are Blacksmith's and belong in `TODO.md`. Step 7 spans the suite and belongs in
`TODO-GLOBAL.md`.

## What this deletes

Tracked here so the cleanup is not quietly dropped:

- `templates/cards-common.hbs` and Squire's forked `templates/chat-cards.hbs`.
- The 8 stats card templates and `styles/cards-stats.css`.
- The legacy `.cpb-chat-card` selectors in `styles/cards-skill-check.css`, and `templates/vote-card.hbs`.
- The `theme-default` render-time rewrite hook in `blacksmith.js`.
- Crier's 59 card CSS overrides; Regent's 4; Artificer's 4 local classes.
- Scribe's six theme files and its `cards.css`.
- Every sibling card template.

## Settled by the author, 2026-08-13

- **Compose-only.** A module composes built-in parts and cannot register a part of its own. Part registration
  is the escape hatch that historically becomes the leak, and it would reopen the drift this plan closes.
  A module needing a genuinely new part asks for one.
- **Flag size is not a risk.** The nine reference cards are as large as cards are expected to get, so a
  composition plus data stays well inside Foundry's message document limits. No measuring gate on step 1.
- **Kill legacy.** See decision 8.

## Open questions

None outstanding. Decisions 1 through 9 are settled; what remains is verification during implementation --
the enrichment pop-in named in decision 9, and the per-step live checks carried on each `TODO.md` item.
