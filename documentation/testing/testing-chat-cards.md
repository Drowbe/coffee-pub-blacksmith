# Testing: chat card parts system

**Audience:** us.

Scope: the parts-based chat card system shipped 2026-08-13 (plan steps 1 to 3), which has not run in a live world. This is a transitional document -- see the testing rules in `CLAUDE.md`. **Remove an item when it passes rather than ticking it, and delete this file when it is empty.**

**Status: nothing here is proven.** The prose pipeline is covered by `node tools/check-card-prose.mjs` (14 checks, passing) and every changed file parses. Everything below needs a running world, because there is no way to render a Handlebars template, exercise a Foundry hook, or judge what a card looks like without one.

Results go to the relevant `CHANGELOG.md` entry, not back into this file.

**Do the first item before any of the others.** If part templates do not render, nothing else in this list can pass, and the failure will be obvious in one step rather than confusing in ten.

## Rendering

- [ ] **Every part renders.** From the console, post one card using all fifteen parts at once. Confirm each appears, none logs an error, and the card is not missing sections. `game.modules.get('coffee-pub-blacksmith').api.chatCards.getParts()` lists them.
- [ ] **Themes tint without changing structure.** Post the same composition in each of the nine themes. Structure identical, colours differ. Announcement themes give a dark background with light header text.
- [ ] **The world default applies.** With `defaultCardTheme` set to something other than Tan, post a card with no `theme`. It uses the configured theme. Then post one with `theme: 'default'` and confirm it is Tan and **stays** Tan -- that pinning is the thing the old sentinel made impossible.

## The prose contract

- [ ] **HTML from a consumer is visible, not rendered.** Post a card whose paragraph text is `<b>3 times</b>`. The card shows those characters literally.
- [ ] **Marks and links work together.** Post `You see an @UUID[<a real actor uuid>]{Ogre} with a big stick. They hit you on the head **3 times** with the stick.` The Ogre is a working document link, `3 times` is bold, and no asterisks remain.
- [ ] **`richtext` renders document HTML.** Post a card with `{ part: 'richtext', html: <a journal page's text.content> }`. Formatting survives and is scoped to card typography.

## Storage and re-render

- [ ] **The composition is stored.** After posting, inspect the message: `flags['coffee-pub-blacksmith'].card` holds `v`, `moduleId`, `type`, a concrete `theme`, and `parts`.
- [ ] **Re-render replaces the baked HTML.** Reload the browser with cards in the log. They still render. Watch for the enrichment pop-in named in the plan -- if a document link visibly appears a beat after the card paints, judge whether it reads as a glitch. That judgement is the point of this item.
- [ ] **A card survives Blacksmith being disabled.** Disable the module, reload, and confirm cards in the log still show their content from the baked HTML (unstyled is expected; blank is a failure).
- [ ] **Chat search finds card text.** Search the chat log for a word that appears only inside a card body.

## Buttons

- [ ] **A registered action fires on the clicking client only.** Register a test action, post a card with a button, and click it as GM and as a player with a second client connected. The handler runs where it was clicked, and `value` arrives.
- [ ] **Buttons survive a reload.** Reload the browser and click a button on a card posted before the reload. It still works -- this is what registering at startup rather than at post time buys.
- [ ] **An unregistered action degrades quietly.** Post a card naming an action nothing registered. The button is inert and logs, rather than throwing.

## Migrated cards, against how they looked before

Each of these replaced a template. Trigger it and confirm it says the same thing and looks right.

- [ ] **Reputation, both cards.** Post current reputation; change reputation and confirm the change card. Scale label and description appear.
- [ ] **Timers, all seven states, on both the combat and planning timers, plus the session timer.** Set, start, pause, resume, warning, ending soon, ended. Confirm the theme shifts -- blue on start and set, orange on warning, red on expired.
- [ ] **Leader change.** Set a party leader. The public card names the leader and the player, and lists the three leader points; the new leader gets the private red card. These previously rendered **empty** through the dead path, so there is no old appearance to match -- confirm against the template that was never reached.
- [ ] **Movement, all four cards.** Change movement mode manually; switch to conga or follow and confirm the marching order table; start combat and confirm the swap card names the mode being restored later; end combat and confirm the restore card.
- [ ] **Hurry-up nudge.** Send one with chat delivery enabled.
- [ ] **XP distribution.** Run a distribution with monsters and players. Summary table, monster rows with the right resolution icon and XP, player rows with portrait, level-up state, and awarded XP. Check a milestone-mode run separately. Confirm the whisper case still whispers when `shareXpResults` is off.

## Regressions to rule out

- [ ] **Sibling cards still render.** Squire, Bibliosoph, Artificer, Crier, Curator, Regent, and Scribe have not migrated and still build their own HTML. Post at least one card from each and confirm the theme accessors they call still work.
- [ ] **Cards posted before this change still render.** Old messages have no flags and keep their baked HTML.
- [ ] **Card padding still applies.** The `removeChatCardPadding` setting still affects new parts-based cards -- they go through the same libwrapper path.
