# Chat Cards Architecture

**Audience:** Contributors to the Blacksmith codebase.

How Blacksmith's chat card system is built: the parts model, how a card is stored, the text pipeline, and how buttons find their handlers. For building cards from another module, see `../api/api-chatcards.md`.

## The model

A chat card is **data, not markup**. A consumer names a composition of parts and supplies their data; Blacksmith renders every part from its own template and assembles the card. No consumer writes card HTML, and no consumer template exists.

The part library is **closed**. Modules compose the built-in parts and cannot register their own, because a registration hook is what lets per-module markup back in and reopens the drift the system removes. A card that cannot be composed is a request for a new part.

Three files carry the system:

- `scripts/manager-chat-cards.js` - the part registry, the renderer, the text pipeline, and theme resolution.
- `scripts/api-chat-cards.js` - the public surface: posting, action registration, theme access.
- `scripts/cards-blacksmith.js` - Blacksmith's own compositions, for cards more than one caller posts.

Target: FoundryVTT v13+.

## Storage: flags plus a baked snapshot

`post()` writes the card twice.

- **Flags** carry the re-renderable payload at `flags['coffee-pub-blacksmith'].card`: schema version, module id, card type, resolved theme, and the parts array. This is what makes improving a part improve cards that already exist, and it confines Foundry markup churn to this module.
- **`content`** carries rendered HTML. This is what survives Blacksmith being disabled, and it is what Foundry's chat search indexes.

On render, the hook at `blacksmith.js` (context `blacksmith-card-rerender`) re-renders from flags and replaces the baked markup. Because enrichment is async, the card paints from its baked HTML first and the fresh render lands a tick later; a failed re-render leaves the baked markup in place, so the card is never blank.

Cards posted before this system have no flags. They keep whatever HTML they were posted with and are not catered for.

## The part library

Parts are declared in `CARD_PARTS` in `scripts/manager-chat-cards.js`, each naming its template under `templates/parts/` and which of its fields carry consumer prose. Read that object rather than a list here; it is the only place the set is defined.

**Parts are named for their shape, never for what a caller might put in them.** `tiles` is a grid of caption-over-value boxes, not "ability scores"; `rows` is a list of thumbnail-label-trailing rows, not "conditions". The first pass named three parts after the reference card each was first seen in, and the one called `status` was carrying monsters and player awards within a day. A use-case name invites the next caller to either misuse it or ask for a near-duplicate, which is how a closed library stops being closed.

Parts that match structure the card system already had - header, identity chip, section divider, prose, key/value table, buttons - render into the existing classes in `styles/cards-common-layout.css`. Only parts with no prior equivalent have rules in `styles/cards-parts.css`.

## Colour from consumers

**A consumer may supply a colour only where the colour encodes a value.** That is the whole rule. In
practice it means data visualisation and nothing else: today, one part.

Everywhere else `tone` names a meaning and the theme decides what it looks like, which is what makes a card
retheme at all.

`gauge` is the exception, and the exception is principled: on a gauge the colour encodes the value rather
than emphasising it, so a fixed palette cannot express it. See the amendment to decision 5 in
`../plans/plan-chat-cards.md` for the test that separates the two.

Those colours reach a `style` attribute, so they go through `safeColour` in `scripts/manager-chat-cards.js`,
which allows `#hex`, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `var(--property)` and keywords, and drops anything
else with a log line. Handlebars escaping alone would stop a value breaking out of the attribute but would
happily pass `red; background-image: url(...)` straight through. The rule is the same one the prose pipeline
follows: an allowlist, not trust.

## Animations

Motion is a named vocabulary in `styles/cards-parts.css` - `shake-x`, `shake-y`, `pulse`, `glow` - applied as `.cpb-anim-{name}`. A part that accepts an `animation` field takes one of those names.

**A name describes a motion, never a meaning.** The crit and fumble rules in `cards-skill-check.css` bind green to a vertical shake and red to a horizontal one; those are d20 rules, and the parts system deliberately does not know them. A card states its tone and its motion separately, so the same shake is available to a crafting result or a countdown.

All animations are suppressed under `prefers-reduced-motion`. Adding a name makes it available to every part at once.

The `pips` centre and `rows` items accept one today. The shake keyframes live here rather than in `cards-skill-check.css` because that file is scheduled for deletion and keyframes are document-global, so the definition must outlive its first caller.

## Composition is flat

A card is a list of parts; a part is not a list of parts. The one exception is `subject`, which carries a
`meter` or a `gauge` because a subject and its standing are one idea -- and it renders that bar by calling
`renderPart` on a real part rather than reimplementing one, so the nested bar cannot drift from the
standalone. See decision 12 in `../plans/plan-chat-cards.md` for why the exception is stated rather than
left to judgement.

## The text pipeline

Consumer text runs through three stages in `processText`, and the order is load-bearing:

1. **Escape** every HTML-special character.
2. **Convert inline marks** - bold and italic only. There is no inline code mark: chat cards do not have inline code in practice, and the mark required lifting code spans out of the string to protect the asterisks inside them, which was the fiddliest part of the pipeline.
3. **Enrich** through Foundry's `TextEditor.enrichHTML`, which resolves `@UUID[]{}`, `[[/r]]`, and `@Check[]`.

Escaping first is what makes "consumers do not pass HTML" a runtime guarantee rather than a documented request: a module that passes `<b>x</b>` sees those characters on the card. Escaping does not damage enricher syntax, because `@`, `[`, `]`, `{`, and `}` are not HTML-special.

Foundry performs stage 3 on any chat content. Stages 1 and 2 exist nowhere else - Foundry has no markdown support - which is why mark conversion is central rather than per-module.

`node tools/check-card-contracts.mjs` asserts these properties against the real functions and exits non-zero if escaping or enricher preservation regresses.

**Structured prose.** The `prose` part takes blocks - paragraph, list, table, quote - rather than a string, so Blacksmith owns what a list or table looks like inside a card. Only the text within a block comes from the consumer.

**Document-sourced HTML** goes through the separate `richtext` part, which enriches but does not escape. It is for content that already exists as ProseMirror HTML in a Foundry document - a journal page, a roll-table description. A module hand-building an HTML string and passing it there is the one misuse the part cannot detect on its own.

## Themes

Themes are colour. A part looks the same in every theme; the theme tints it through the `--blacksmith-card-*` variables defined per theme in `styles/cards-common-themes.css`. The theme list is `CHAT_CARD_THEMES` in `scripts/manager-chat-cards.js`.

The world default is resolved **once, at post time**, in `ChatCardsManager.resolveThemeId`, and the concrete theme id is what gets stored. An unknown theme id falls back to Tan and logs.

## Card actions

Buttons carry `data-cpb-module` and `data-cpb-action`, deliberately not `data-action`, which ApplicationV2 claims.

Handlers are registered at startup through `ChatCardsAPI.registerAction(moduleId, action, handler)` and held in a module-level registry. A single delegated `renderChatMessageHTML` hook (context `blacksmith-card-actions`) resolves the handler fresh on every render and binds the click, through `bindCardActions` in `scripts/blacksmith.js`. Re-rendering from flags replaces the card element with buttons that carry no listeners, so the re-render calls the same binder after the swap; binding is idempotent so markup that survives is not bound twice.

A ChatMessage is data on every client, so a callback cannot ride the document. Resolving on render is why buttons keep working after a browser reload, and why a card whose module is disabled degrades to an inert button rather than an error.

## Posting

`post()` sends through `ChatMessage.create`, not around it. `scripts/manager-libwrapper.js` wraps that call to stamp `isCoffeePubCard` and `removeChatCardPadding` and to fire `preCoffeePubChatMessage`; bypassing it would give API-posted cards different flags from directly-posted ones.

## What has not moved yet

Combat and round statistics cards (`scripts/stats-cards.js`), the vote card (`scripts/manager-vote.js`), and the skill check card (`scripts/window-skillcheck.js`) still render their own templates and post directly. They keep the legacy `.cpb-chat-card` and `.vote-card` roots and their own CSS. Sibling modules also still build their own card HTML.

## Integration points

| Concern | Location |
|--------|----------|
| Part registry, renderer, text pipeline, themes | `scripts/manager-chat-cards.js` |
| Public API: post, actions, themes | `scripts/api-chat-cards.js` |
| Blacksmith's own compositions | `scripts/cards-blacksmith.js` |
| Part templates | `templates/parts/` |
| Part styles | `styles/cards-parts.css` |
| Shared card layout and base variables | `styles/cards-common-layout.css` |
| Theme colours | `styles/cards-common-themes.css` |
| Re-render and action hooks | `scripts/blacksmith.js`, contexts `blacksmith-card-rerender` and `blacksmith-card-actions` |
| Posting interception | `scripts/manager-libwrapper.js` |
| Style loading | `styles/default.css` |
| Consumer/presentation boundary | `tools/check-card-contracts.mjs` |
| API reference | `../api/api-chatcards.md` |
