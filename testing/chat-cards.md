# Testing: chat card parts system

**Audience:** us.

Scope: the parts-based chat card system shipped 2026-08-13 (plan steps 1 to 3). This is a transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this file when it is empty.**

**Status: rendering, buttons and multi-client all passed in a live session on 2026-08-19.** Cards posted and were clicked in play with players on their own clients -- the rest flow is card-button driven, so a registered action firing on the clicking client is proven by the rest requests completing once each. Sibling cards from the unmigrated modules rendered alongside, and pre-change cards in the log still showed their content.

**What is left needs a deliberate act:** a browser reload, a setting flipped, a theme posted on purpose, or one of the specific migrated cards triggered. Nothing here is known to be broken.

Results go to the relevant `CHANGELOG.md` entry, not back into this file.

**Use the Chat Cards suite in `testing/test-harness.js`** for most of what follows. Its headless tier asserts the escaping, enricher, storage and theme contracts and runs under "Run All Headless". Its interactive tier posts **one card per button** -- baseline, identity, meters and pips, bands, tiles, thumbnail treatments, outcome tones, quiet rows, emphasis blocks, richtext, and one card per theme. One card at a time is the point: a card showing every part at once proves the parts render and hides how they sit together.

## Needs a reload

- [ ] **Re-render replaces the baked HTML.** Reload the browser with cards in the log. They still render. Watch for the enrichment pop-in named in the plan -- if a document link visibly appears a beat after the card paints, judge whether it reads as a glitch. That judgement is the point of this item.
- [ ] **Buttons survive a reload.** Reload the browser and click a button on a card posted before the reload. It still works -- this is what registering at startup rather than at post time buys.
- [ ] **A card survives Blacksmith being disabled.** Disable the module, reload, and confirm cards in the log still show their content from the baked HTML (unstyled is expected; blank is a failure).

## Needs a setting or a theme chosen on purpose

- [ ] **Themes tint without changing structure.** Post the same composition in each theme. Structure identical, colours differ. Each theme's `-dark` partner fills only the card header, leaving the body as the light theme has it.
- [ ] **The world default applies.** With `defaultCardTheme` set to something other than Tan, post a card with no `theme`. It uses the configured theme. Then post one with `theme: 'default'` and confirm it is Tan and **stays** Tan -- that pinning is the thing the old sentinel made impossible.
- [ ] **Card padding still applies.** The `removeChatCardPadding` setting still affects new parts-based cards -- they go through the same libwrapper path.
- [ ] **An unregistered action degrades quietly.** Post a card naming an action nothing registered. The button is inert and logs, rather than throwing.
- [ ] **Chat search finds card text.** Search the chat log for a word that appears only inside a card body.

## Migrated cards not yet seen

Each of these replaced a template. Trigger it and confirm it says the same thing and looks right.

- [ ] **Reputation, both cards.** Post current reputation; change reputation and confirm the change card. Scale label and description appear. Reputation is read from Squire's party tab now, so trigger it there.
- [ ] **Timers, all seven states, on both the combat and planning timers, plus the session timer.** Set, start, pause, resume, warning, ending soon, ended. Confirm the theme shifts -- blue on start and set, orange on warning, red on expired. Combat ran on 2026-08-19, so some of these have been seen incidentally; the matrix has not.
- [ ] **Leader change.** Set a party leader. The public card names the leader and the player, and lists the three leader points; the new leader gets the private red card. These previously rendered **empty** through the dead path, so there is no old appearance to match -- confirm against the template that was never reached.
- [ ] **Movement: the other three cards.** The conga marching-order card is confirmed (2026-08-13) -- header, description, and the position/name table all render. Still owed: a manual mode change, the combat-start swap card naming the mode to be restored later, and the combat-end restore card.
- [ ] **Hurry-up nudge.** Send one with chat delivery enabled.
- [ ] **XP distribution: the two variants.** A monsters-and-players distribution ran on 2026-08-19. Still owed: a milestone-mode run, and the whisper case with `shareXpResults` off.
