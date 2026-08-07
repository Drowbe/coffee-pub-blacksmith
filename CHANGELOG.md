# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Added - the effects layer now adapts the effects ecosystem, and owns expiry

- **`remaining` on the display DTO, as a value and its unit** (`scripts/api-effects.js`, `documentation/api/api-effects.md`): `{ value, unit }` where unit is `'seconds'` or `'rounds'`, or `null` for an effect with no duration - which is not the same as zero. `durationLabel` remains the string to show; `remaining` is the number to reason about, and nobody should parse the label. `effects.getRemaining(effect)` and `effects.hasExpired(effect)` expose the same logic for an effect a consumer already holds.
- **The unit is part of the answer, not an implementation detail.** Foundry reports `duration.remaining` in whichever unit the document happens to carry - seconds for a seconds duration, a decimal count of rounds for a turns duration - and announces that nowhere. A consuming module shipped two bugs from assuming seconds: one understated every rounds-based duration by a factor of `CONFIG.time.roundTime`, the other gated on `duration.seconds` being positive and so treated every converted effect as permanent. Rounds are deliberately **not** converted to seconds for the caller: a rounds duration advances with the combat tracker rather than the world clock, so quoting it in seconds would state a remainder that is not true.
- **Times Up integration** (`enableTimesUpIntegration`, world scope, default on, `scripts/settings.js`, `lang/en.json`): mirrors `enableMidiIntegration` exactly - module active plus setting on, checked at runtime so toggling applies live. Times Up's `setDurationRounds` rewrites short seconds durations into rounds and nulls `duration.seconds`; where it has, `remaining` reports the seconds anyway, because the effect was authored in seconds and the rewrite is substrate variance rather than a change of meaning. **Turning the setting off with Times Up installed makes both expire the same effect**, so it is documented as diagnostic rather than as a normal mode.
- **Two independent sources of rounds-based durations, and a fix for one alone would be wrong.** Besides Times Up, dnd5e's `DurationData.getEffectDuration()` maps a source item's own units at creation - `round`/`turn` produce `{rounds}`/`{turns}` - and the sheet's Temporary section defaults `duration.rounds` to 1. Those occur with no third-party module installed at all.
- **`blacksmith.effects.expired`, and Blacksmith now arbitrates who deletes an expired effect.** Foundry core does not expire effects; Times Up does, and it is optional. That left every consumer with three moves and no correct one: always delete and race Times Up, never delete and let effects linger forever without it, or check whether Times Up is installed - which the ownership rules forbid a satellite. **The loser of that race cannot even fail quietly**: Foundry notifies from inside the socket response handler, `SocketInterface.#handleError` calling `ui.notifications.error` before `reject`, so a caller's `catch` is strictly too late and a pre-flight existence check only narrows the window. Arbitration therefore has to sit in the one layer permitted to know Times Up is there.
- **Expired means the clock ran out, not that the document is gone.** Removal is carried by Foundry's own `deleteActiveEffect`, which fires whoever deleted and reaches every client; keeping the two apart is what lets the layer yield deletion to Times Up without the event's meaning changing. **Consumers must not delete on expiry** - exactly one actor does in every configuration, and `deletedBy` on the event payload says which.
- **The sweep runs GM-only, on `updateWorldTime` and on combat turn/round changes**, because seconds and rounds durations advance on different clocks and neither implies the other. The GM check deliberately sits in the sweep rather than at hook registration: `EffectsAPI.initialize()` runs at `init`, before `game.user` exists, so gating registration would evaluate undefined on every client and register nothing anywhere. Announced effects are remembered for the session so the event fires once rather than on every tick, and the record is dropped on delete so a re-applied effect can expire again.
- **"Duration ticking or expiry" is deliberately no longer a non-goal** of the effects layer, and the architecture doc says why it moved rather than quietly dropping it: a non-goal is a decision, and declining this one did not remove the problem, it pushed an unsolvable one onto every consumer. The layer is now authoritative about exactly one thing. Active Effect CRUD remains a non-goal with one stated exception - it deletes an effect whose clock it owns, because arbitration is meaningless without it, and creates and updates nothing.
- **Verify live**: in a world with Times Up enabled, apply an effect with a duration above its *Max rounds to convert* threshold and one below it. Confirm `remaining` reports seconds for both, unchanged across the conversion boundary in either direction, and that neither jumps when combat starts or ends. Let one expire and confirm exactly one deletion happens, with no error banner, and that a subscriber to `effects.onExpired` is called once rather than per tick. Disable `enableTimesUpIntegration` and confirm Blacksmith expires it instead. Disable Times Up entirely and confirm expiry still happens. Finally apply an effect authored in rounds by a dnd5e item, which never passes through Times Up, and confirm it reports `rounds` and expires on combat advancement rather than on the world clock.

### Added - "Mop the Dead": a second blood cleanup timer, for corpses

- **`tokenBloodMopDeadSeconds`** (`scripts/settings.js`, `scripts/manager-token-indicators.js`, `lang/en.json`): a 0-60 second slider, default 30, registered directly under Blood Cleanup in Run the Game -> Health Indicators. Seconds until a **dead** token's blood pool is removed, counted from the moment it died. 0 means never, the same convention Blood Cleanup uses.
- **Why it is a second setting rather than a wider first one.** `tokenBloodCleanupSeconds` defaults to 0 - blood is permanent - which is the right default while a fight is in progress and the wrong one for the bodies left behind it. Two timers is what lets a table keep blood on the living forever and still have corpses cleared.
- **The seam is `_scheduleBloodCleanup` (`manager-token-indicators.js:1585`), and nothing else moved.** It now picks its interval from the mesh entry's severity: `dead` reads the new setting, every other tier reads Blood Cleanup. No new hook, no new timer plumbing - a corpse's blood mesh is built at the moment it crosses into the `dead` tier, and building already schedules. The key was added to the manager's `watchedKeys` set so a change rebuilds and reschedules live.
- Consequence worth knowing: rebuilding blood (a scene load, toggling a blood setting) rebuilds a corpse's mesh and therefore restarts its mop timer, so bodies already on the ground are mopped 30 seconds after a page refresh. That is how Blood Cleanup has always behaved on rebuild.
- **Verify live**: set Mop the Dead to 5 and Blood Cleanup to 0. Damage a token to bloodied - its pool stays indefinitely. Kill it - the heavier dead pool appears, then clears about 5 seconds later and does not come back. Damage a second token without killing it and confirm its blood is still there. Set Mop the Dead to 0 and kill a token - the pool stays. Confirm on a player client as well as the GM's, since each client runs its own timer.

### Added - disposition on the combat bar, and square portraits

- **Disposition colours the portrait button itself** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menubar-combatbar.css`): friendly, neutral, hostile, or secret, read from `combatant.token.disposition` against `CONST.TOKEN_DISPOSITIONS` by the new `CombatBarManager.getCombatantDisposition`. The fill wins because it is the whole object - a combatant's disposition is a property of the combatant, not an ornament attached to one, and colouring the thing itself says so with no extra element at all.
- **Four other surfaces were tried and all read worse**, which is recorded at the site so it is not re-litigated: a stripe *under* the portrait (chrome that had come loose - a rectangle bolted under a stack of circles); a concentric ring outside the health ring (two rings around one small portrait, and the eye has to work out which one it is being asked to read); the `images/markers` bunting hung from the top (drapery over a face); and a flat strip across the top (worse than the bunting).
- **The bunting was the intent and is not reachable.** The art is a valance, so it wants to hang *below* the button over the canvas, and three ancestors clip it: `.blacksmith-menubar-secondary` and `.combat-portraits-scroll-wrapper` both set `overflow: hidden`, and `.combat-portraits` is a horizontal scroll container, which always clips its scrollport. There is no CSS escape - `overflow-clip-margin` does not apply to scroll containers, and a `position: fixed` child still needs viewport coordinates it cannot get without measuring. The only route is a body-level layer reading every portrait's `getBoundingClientRect()` and re-syncing on every strip scroll, window resize, and bar re-render, on a bar that redraws each turn. Judged not worth the fragility.
- **Whose turn it is is now motion, not colour: the active combatant's portrait breathes inside its button.** Adopting Foundry's saturated palette left no colour that reads as "special" rather than "a fifth disposition" - the fill shows as a frame around the portrait, so an orange border beside it was simply a second coloured ring. Motion has no such problem: it is the only thing moving on an otherwise still bar, so the eye finds it without being told where to look, and it survives the palette changing again. Corner ticks were tried and read badly.
- **Non-active combatants rest at 85%, and the active one grows back to full size as it breathes.** The whole button scales, contents and all, so the portrait, the health reading and the disposition fill move together as one object. The trough of the pulse (92%) sits above the resting size, so the active combatant is larger than the rest at every point in the cycle rather than only at the top of it. Scaling the button's *contents* instead was tried and left a thick band of disposition fill around a shrunken face - a heavy coloured frame rather than a smaller combatant.
- **A negative margin hands back the width the scale reclaims, and it is not optional.** A scale shrinks the drawing but not the layout box, so on its own every button keeps its full footprint and the reclaimed 15% shows up as gap between portraits - which is exactly how this looked the first time it was tried. The margin is derived from `--portrait-rest-scale` rather than stated, because half the shortfall has to come off each side and the two numbers must agree exactly. Visible spacing therefore stays `--gap`, and the strip fits as many combatants as it did at full size.
- **Fixed: the health bar belonged to the button, not to the portrait, and overhung it at every bar size.** It was inset 1px from the *button*, which made it wider than the portrait it sits on, and its flat 2px corners cut across the 4px curve behind them - most visibly on the largest button on the row, the active combatant's. Its outer edge, border included, now lands exactly on the portrait's left, right and bottom edges: a 100px portrait gets 1px border + 98px of bar + 1px border, with the bottom border on the portrait's own bottom edge. That is what gives it the "in a container" look rather than a rail laid across the button behind it.
- **The 1px rule is a real border on a `border-box` element, not a `box-shadow`.** A shadow draws *outside* the element, so it silently added 2px to the bar's true width and pushed it past the portrait however the box was positioned. A border inside a border-box element is counted in the width the way the requirement states it.
- **Both the inset and the corner radius are derived** - from `--portrait-inset` (half the difference between button and portrait) and `--portrait-radius` - so the bar tracks either portrait shape and any combat bar size without restating the arithmetic. `--portrait-inset` is declared on the container rather than at `:root` because the two shapes size the portrait differently, and a custom property substitutes the value that won the cascade on that element.
- **The row's total width does not change as the turn moves**: exactly one button is at full size at any moment, so one growing is always paid for by another shrinking.
- **The scale is CSS's independent `scale` property, not a `transform`.** The elements involved already use `transform` for centring, and a keyframe setting `transform` replaces that whole value - which sent the portrait to the button's bottom-right corner for the duration of the animation the first time. Animating `scale` alone composes with any existing `transform`, so one keyframe set serves whatever it is applied to.
- **One spacing value for the whole combat row** (`styles/menubar-combatbar.css`). Portraits sat at `--gap: 2px` while the encounter/tokens/initiative controls used a hardcoded `4px` and the scroll-arrow wrapper another hardcoded `2px`, so the portrait strip read tighter than the buttons beside it. `--gap` is now `4px` and all four sites reference it, because "the same gap" is the requirement and separate numbers that happen to agree are one edit away from not.
- **The secondary bar group divider is gone** (`templates/partials/menubar-secondary-default.hbs`, `styles/menubar.css`): the 1px rule drawn between groups, in all three zones of every secondary bar. It earned its keep on a bar of bare icon buttons, where the eye had nothing else to group by; it does not on a row where every readout is a boxed chip with its own edges, and between two of those it was a third edge in a space that already had two. The markup and its stylesheet rule are both removed rather than the element being hidden, so it costs no width either. Group spacing is now the zone's own 8px gap and nothing else.
- **The pulse never exceeds 1.** Nothing clips inside the button, but the strip does: `.combat-portraits` sets `overflow-y: hidden`, and in Square mode the portrait sits only 3px inside its button, so an upward swing is sliced flat mid-breath past about 1.05. Swinging down from natural size needs no such margin and behaves identically in both shapes - in Round mode the portrait simply breathes within a health ring that stays put.
- **Transform-only, so the pulse composites on the GPU** with no layout or paint per frame, and only ever one element animates. Infinite animation is an established pattern here - `blacksmith-pulse-dead` on the health ring is the other - and the two share a 2s tempo, so a dead combatant taking its turn breathes and pulses together rather than beating against itself.
- **Hover lost its `transform: scale(1.0)`**, which had been a harmless no-op until size became the turn marker - at which point hovering any portrait would have grown it to exactly the active combatant's size and said the turn had moved. Hover keeps brightness, which is its own channel.
- **The `.current.combat-token-hidden` rule is gone.** It existed only to reconcile two treatments that both wanted the border - the turn's colour and hidden's dotted stroke. They no longer compete, so the two states simply stack.
- **No portrait state may set `background`.** Hover, hidden, and defeated each used to paint over the container, which would silently blank the disposition of whichever combatant was in that state. Hidden keeps its dotted border and opacity; defeated drains colour with `grayscale` and keeps the skull overlay.
- **Defeated combatants drain colour with `grayscale` rather than painting over the container**, so the disposition fill stays readable down the strip; the skull overlay says dead. `filter` does not compose across CSS rules, so `defeated:hover` restates the pair rather than giving every portrait an always-on no-op filter.
- **Portrait Shape setting** (`menubarCombatPortraitShape`, `scripts/settings.js`, `lang/en.json`): Square (default) or Round, per user, under Run the Game -> Combat -> Combat Menubar. Square lays a health bar across the portrait's lower edge; Round wraps the portrait in a health ring. The disposition fill is unaffected by it. The in-flight initiative drag ghost follows the shape too; it lives on `<body>` so it is told directly rather than inheriting.
- **Two readings, not one reading in two costumes.** A square *ring* was built first and dropped. It worked - `stroke-dasharray` divides a rounded rectangle's perimeter as happily as a circumference - but an SVG rect's path begins after its first corner radius and runs clockwise, so it drained from the top-left **corner** with no obvious start or direction. A circle has twelve o'clock; a rectangle has no equivalent, and the fix would have been to hand-draw the outline as a `<path>` starting at top-centre. A horizontal bar sidesteps the question: left to right needs no explaining. Square mode therefore has no SVG and no perimeter arithmetic at all - a percentage width is the whole of it - and the rect geometry is deleted rather than left dormant.
- **The portrait nearly fills the button in Square mode**, because nothing has to be left around it: the bar lies across the portrait rather than encircling it. Round runs smaller, since it must reserve an annulus for its ring.
- **The bar sits one pixel inside the button on the three edges it meets**, with a 2px corner on its **bottom** two only. That pixel is not margin - it is the only place the disposition colour shows past the bar, a hint of what the bar is sitting on. The bar follows the button's own bottom corners; its top edge is a cut across the portrait rather than an edge of an object, and rounding it floated the bar off the seat it sits in. It is inset by `left`/`right`/`bottom` rather than a width and a centring transform, so the gap is stated as the pixel it is instead of falling out of an arithmetic that would need re-deriving every time the portrait resizes. The radius is deliberately below the token scale: `--blacksmith-radius-sm` is 3px, which on a bar a few pixels tall rounds the ends into a lozenge. The fill inside is square and clipped by the track's `overflow: hidden`; inheriting the radius rounded the fill's leading edge, which is a moving cut through the bar rather than an end of it.
- **The portrait button is square in both shapes.** It was 8px wider than it was tall, which nothing inside it ever used - portrait, health ring and disposition fill are all centred and all sized off the height - so the extra width was dead margin either side of a square stack. Equal sides also buy back 8px per combatant, so more of the strip fits before it scrolls.
- **Both shapes draw their empty part.** The ring gained an undashed track beneath the dashed value; the bar has a groove behind its fill. Without one the depleted portion was simply absent, which reads as a control that failed to render rather than a bar that is part empty. Deliberately dark rather than a tint of the health colour: the empty part of a bar is absence, and tinting it with the reading makes a half-empty ring look full. The ring's track rule has to out-specify the health states and pin `animation: none`, or it would be painted in the health colour and pulse along with a dead combatant.
- **The five health colours are stated once, not once per shape** (`styles/menubar-combatbar.css`): the `combat-portrait-ring-*` classes now carry only a `--health-ink` custom property, which the ring uses as a stroke and the bar as a fill. Five colours restated per shape is exactly the kind of pair that drifts. The dead pulse is the one thing kept as two keyframe sets, since a custom property is only animatable once registered with `@property`, and registering one to save six lines buys a dependency for no readability.
- **Square corners answer to the button's corner, not to their own size.** The portrait's radius was 22% of itself, so it swept far wider than the button it sat inside and read as a different shape. Button, portrait, and drag ghost now all use `--blacksmith-radius-md`.
- **The word joins the hover card and the popout card**, beside the owner and initiative labels, with a matching colour dot (`buildCombatantHoverCardHtml`). It is on the limited player-viewing-an-NPC card too.
- **Shown to everyone, deliberately.** Foundry already colours every visible token's border by disposition on the canvas, so a player learns nothing here they could not read there - and hidden combatants never reach a player's strip in the first place.
- **Eight new design tokens** (`styles/vars.css`, `documentation/design-system/design-tokens.md`): a solid and a `-bg` fill per disposition, following the variant palette's stated-not-derived pairing. The solid tokens colour the dot on the hover card, the `-bg` tokens the button fill.
- **The values are Foundry's own, verbatim**, from `CONFIG.Canvas.dispositionColors` in core's `client/config.mjs`. A muted palette tuned to this module was tried first and dropped: matching core means matching every other module that reads disposition, which is worth more than a palette that only agrees with itself. Disposition is a Foundry concept rather than a system one, and the dnd5e system does not override these - 5e has social attitude but attaches no colours to it. All four fills share one alpha, so none is quietened relative to its neighbours. Worth knowing: **core's FRIENDLY is cyan, not green** - the green usually associated with friendly is core's separate PARTY disposition (`0x33BC4E`), which has no token here. `node tools/check-design-tokens.mjs` passes.
- **`handleTokenHpChange` is now `handleTokenChange`** (`manager-combatbar.js`), which is what it always was: it reacts to HP, hidden, and now disposition, and keeps its existing "is this token actually a combatant" test so a disposition change on an unrelated token does not rebuild the bar. Sole caller is the `updateToken` hook.
- **Verify live**: start a combat with a friendly PC, a hostile NPC, and a neutral NPC. Each portrait button carries its own disposition colour. Non-active combatant buttons sit at 85%; the active one breathes back up to full size. Confirm the spacing between portraits looks the same as the spacing between the encounter, tokens and initiative buttons, and that it does NOT open up around the smaller buttons; hovering any other portrait brightens it without moving it. Watch a full breath in both portrait shapes and confirm the portrait is never clipped flat at the top or bottom of its swing, and that it stays centred throughout. Advance a turn and confirm the row neither reflows nor scrolls. Change an NPC's disposition on its token sheet - the button recolours without reopening the bar. Hide a token as GM, and kill one - both keep their disposition colour while still reading as hidden and dead, and check the ticks are still legible when the active combatant is the hidden or the dead one. Take a combatant to roughly half HP and confirm the ring is clearly half-lit against a dark groove rather than ambiguous. Switch Portrait Shape to Square: the ring is replaced by a bar across the lower portrait, the same combatant reads half-full there too, and dragging a portrait to reorder initiative shows a square ghost. Check the two ends in both shapes - full HP and zero, where zero shows a full pulsing red reading and an NPC with enemy health bars hidden shows a full pale one. Run the combat bar size setting from smallest to largest in both shapes. Confirm a player sees the same colours and the words on the hover card, including on an NPC's limited card.

### Changed - Round and Turn share one two-field readout

- **`shape` on the statchip kind** (`scripts/api-menubar.js`, `templates/partials/menubar-secondary-item.hbs`, `styles/menubar-widgets.css`): `'pill'` (default, the label-then-value chip as before), `'badge'` (the value alone in a small square-cornered box, neither label nor icon), or `'split'` (two values, each in its own field). Documented in `documentation/api/api-menubar.md`. Shapes rather than new kinds, because the markup, the tone and emphasis classes, and the patch path are identical in each - a second kind rendering the same elements is exactly what the item partial's header warns against.
- **The combat bar's Round and Turn are one item, `round-turn`, drawn as a `split`**: the round in a darker field, then "2 of 7". Between them the words "Round" and "Turn" cost more of the data row than the numbers they named, and two separate boxes then spent the saving again on a second set of edges and the gap between them. This is the one readout nobody needs told: its position never changes and the numbers only count up.
- **`split` puts a value in the label slot and gives it the value typography wholesale** - size, weight, tabular figures and colour - because the shared chip rule styles labels as *names*: 0.8em, uppercase, tracked, and at 0.55 alpha. Left as a label the round number matched the muted "of" beside it rather than the numbers either side. The two fields are now identical in every respect but the ground behind them, which is the whole idea.
- **The box takes a real border rather than an inset `box-shadow`.** An inset shadow paints *under* an element's children, so each field's translucent background tinted the hairline differently and the box came out with two edge colours - darker along the round half, lighter along the turn half. A border sits outside the padding box where no child can reach it. `emphasis: feature` supplies both that inset shadow and a fixed `height`, so `split` explicitly nulls them: left in place the two-tone edge returns and taller content clips instead of growing.
- **Ordinary corners, not a capsule.** The badge was a stadium first, with a minimum width equal to its height so a single digit came out as a circle. It read as a token and it spent real width on the round ends - on the one row where width is the scarce thing - to say nothing a square-cornered box does not. `split` inherits the same square corners.
- **Retired two `valueParts` forms that a prior iteration added.** `{ divider: true }` drew a seam between two readings and `{ text, lead: true }` set the principal one larger; both were attempts to separate and rank two numbers sharing one box, and the two-field treatment does that better - a seam spends width on a mark that reads as content, and size makes one number the subject and the other an annotation when they are of equal rank. Nothing used them once `split` existed, so they are gone from the code, the template, the stylesheet and the API doc rather than left as unused surface.
- **Fixed: a `label` pushed alongside `valueParts` was silently dropped.** The patch path handled the parts and returned, so a chip carrying both could never update its label - which is exactly what `split` does every turn. The label now patches on that branch too, the same way it does on the plain-value path.
- **Fixed: `registerSecondaryBarItem` rejected a display item whose only content was `valueParts`.** The content guard tested `label`, `value`, and `image` and predates `valueParts`, so a chip stating its numbers in parts could not register at all.
- **The badge sizes to a minimum height rather than a fixed one**, and its fill carries its own corner radius instead of relying on being cropped by `overflow: hidden`. A fixed height clipped taller content rather than growing to hold it. In the ordinary case the box still matches the feature pill's height, so the row stays even.
- **The tooltip carries the meaning and the values together** - "Round 4 - turn 2 of 6" - pushed with each update rather than fixed at registration, so the readout can never sit under a tooltip that does not mention its figures.
- **Documented `valueParts` for the first time** in `api-menubar.md`, including that the part count is structure and changing it forces a rebuild rather than an in-place patch.
- **Fixed a doc drift found on the way**: `api-menubar.md` described the gaugechip as a ring with a sweep. It has been a horizontal meter since the ring was tried twice and retired (see the note in the partial).
- **Verify live**: open the combat bar in a fight. One squared box holds the round number on a darker field, then "2 of 7" on the lighter one, at the same font size and with no words. Hover it - the tooltip reads "Round N - turn N of M" and tracks the numbers as turns advance. Advance past round 9 and confirm the box widens rather than clipping. Run the combat bar size setting from smallest to largest and confirm both fields scale with the row.

### Added - the party leader can fire Quick Toasts

- **"Enable Leader Access" per template** (`scripts/window-toast-send.js`): a checkbox in the Send Toast window's Template section, saved in the template snapshot like every other field. It marks a template as fireable by the elected party leader. Built-ins carry `false` and would be unreachable anyway - they hold no text by design, and a fireable template needs a title.
- **The Quick Toast menubar item is now visible to the leader as well as the GM** (`scripts/api-menubar.js`), on the same `isCurrentUserPartyLeader()` rail the vote button already uses. One registration serves both audiences: the menu knows who opened it, and `templateData.isLeader` is already part of the menubar structure fingerprint, so a leader change re-renders and the button arrives or leaves on its own.
- **The leader's menu is narrower.** It lists only leader-access templates and omits the entry that opens the Send Toast window, which is the GM's tool. An empty list says the GM has not shared any.
- **The leader's recipients are the whole table.** A GM's Quick Toast goes to the party (online non-GM users minus the excluded); a leader's goes to every online user but themselves, GMs included - a leader announcing to the table means the table, and the GM is at it. The sender is dropped for the same reason the GM's send is not echoed back: they get the small confirmation toast instead.
- **Nothing on the leader path writes.** `toastSendTemplates` is world-scoped and read-only to a player, and socketlib's `executeForOthers` is not GM-gated, so the existing targeted relay carries a player's send with no new plumbing and no change to the receipt-side `_recipients` gate.
- **GMs are now tickable recipients in the Send Toast window.** Without them a leader could not reach the GM at all, and a co-GM could not be reached either. They are listed after the players and badged `GM`. **"Entire Party" still means online players only** - a GM is included by ticking them, the same deliberate act offline and excluded rows already require - and the send unions ticked ids with the resolved party rather than replacing them, so a GM ticked beside a checked party box is not silently dropped. The checkbox label now reads "Entire Party (all players online)" to say so.
- **Verify live**: as GM, save a toast template with a title and tick Enable Leader Access; save a second without it. Elect a player as party leader. On that player's client, Quick Toast appears on the party menubar and lists only the first template; firing it shows the toast on every other client including the GM's, and the leader sees only the "Toast sent" confirmation. Confirm the second template never appears for them, and that Open Send Toast does not. Un-elect the leader and confirm the button leaves their bar without a reload. As GM, open Send Toast and confirm a second GM appears badged GM, that checking Entire Party neither ticks nor disables that row, and that ticking it as well delivers to both the party and the co-GM.

## [13.15.2]

### Added - the GM's canvas can follow the turn order

- **"Pan To Current Combatant"** (`scripts/settings.js`, `scripts/ui-combat-tracker.js`, `lang/en.json`): a new setting under Run the Game -> Combat -> Combat Tracker Tools. When enabled, an `updateCombat` turn change pans the GM's canvas to the current combatant's token. Foundry core offers only a *manual* pan - the crosshair control on a combat tracker row (`_onPanToCombatant`, core `client/applications/sidebar/tabs/combat-tracker.mjs`) - and neither core nor dnd5e has an automatic equivalent, so nothing here duplicates or fights an existing feature.
- **GM only, by design.** The hook returns immediately for non-GM users rather than gating on token ownership the way its neighbour `combatTrackerAutoSelectToken` does. Moving a player's viewport on someone else's turn takes the camera away from whatever they were looking at, which is a worse outcome than the convenience is worth; the GM is the one person tracking every turn. The setting is `world` scope for consistency with the rest of the section, and because only the GM can change a world setting it reads as the GM's own preference.
- **The pan itself is `CombatBarManager.panToCombatant`, not a second implementation.** That is the same call behind the combat bar's "Pan to Token" menu item and a portrait click, so a turn change lands the view exactly where reaching for it by hand does, and it brings the token highlight along with it. A hand-rolled `canvas.animatePan` was tried first and was worse in practice, which is the whole argument for reusing the one that was already right. Because `manager-combatbar.js` imports `ui-combat-tracker.js`, the call goes through `await import` - the same way the combat bar reaches back into this file.
- **Token selection is deliberately not requested.** `panToCombatant` takes a `selectToken` option and it is left off, because selecting the current token is `combatTrackerAutoSelectToken`'s job; passing it here would let this setting silently override that one.
- Panning is skipped when combat has not started, when there is no current combatant, and - via `panToCombatant`'s own lookup - when the combatant has no token on the scene being viewed.
- **Verify live**: enable Run the Game -> Combat -> Combat Tracker Tools -> Pan To Current Combatant. Start a combat with tokens spread far enough apart that they cannot all be on screen, and advance turns - the canvas lands on each token exactly as clicking its portrait in the combat bar does, wrapping correctly at the round boundary. With `combatTrackerAutoSelectToken` off, confirm the pan does not select the token. Confirm a logged-in player's canvas does not move. Move a combatant's token to a second scene, view that other scene as GM, and confirm the canvas stays put on that combatant's turn.

## [13.15.1]

### Fixed - anyone logged in could vote, including accounts with no character

- **Vote eligibility ignored characters entirely** (`scripts/manager-vote.js`, `scripts/api-core.js`): the rule was `u.active && !u.isGM`, so any connected non-GM account could vote - a camera or stream account, or a player who owns only a dnd5e `group` actor. A spectator that never votes also means a vote can never reach unanimity, so it hangs until closed by hand. Eligibility is now "logged in, not the GM, and owns at least one `character` actor", via a new `ownsAnyCharacter` in `api-core.js` - the user-side counterpart to `isPlayerCharacter`, drawing the same line for the same reason. A `group` actor is routinely shared with the whole table, so the type test is what does the work; ownership alone would let anyone holding it vote.
- **Four call sites still fell back to a rule that had been abandoned** (`scripts/manager-vote.js`): a vote snapshots its eligible users at the start, and every reader of that snapshot fell back to `getUsersWithOwnedTokenOnCanvas()` when it was absent - the *previous* eligibility model, requiring an owned token on the current scene. The comment at the one place eligibility was actually computed said "No canvas-token requirement" while four other places still applied one, and the message shown to a rejected voter told them to go place a token. The fallback now recomputes with today's rule through one `_getEligibleIds` helper, and `getUsersWithOwnedTokenOnCanvas` is deleted - it had no other caller.
- **The "Current Players" vote entry could offer itself and then produce nothing** (`scripts/manager-vote.js`): its availability gate counted `game.users.filter(u => u.active)` - the GM and characterless accounts included - while its option list came from a narrower set. Both now read the same helper.
### Fixed - toast channels were undiscoverable, and an empty allow-list allowed nothing

- **An empty `toastBypassChannels` now allows every declared channel** (`scripts/api-toast.js`): it previously allowed none, which cost a real session. A table played an evening with a camera account and captured none of its criticals, fumbles, or injuries - nothing was broken, the allow-list was empty and there was no way to discover what to type into it. **A default that requires a secret to be useful is a broken default however correct its logic.** Declaring a channel is already the sender saying "this is a notable event, not routine chatter", so honouring that by default makes the feature work untouched and leaves the setting as the thing a GM reaches for to *narrow* it. A non-empty value keeps its exact former meaning, so no configured world changes behaviour.
- **Each declared channel is its own checkbox setting** (`scripts/api-toast.js`, `scripts/settings.js`): `registerChannel` creates an ordinary Boolean world setting named and hinted from what the sender supplied, defaulting to on. A channel is a label and a checkbox, which is exactly what a Boolean setting is, so Foundry renders it and there is no markup involved. An intermediate build kept one comma-separated field and drew a checklist into the settings form from a `renderSettingsConfig` hook - reimplementing in CSS what the form already does, and getting it wrong: the list went into `.form-fields`, a flex row for the input, so a five-row checklist and a text box shared one cell at half width each. **Do not reach for a settings-form hook to render what the form renders natively.** The free-text setting, the hook, and the stylesheet block are all deleted; nothing had shipped, so there is nothing to migrate.
- **Channels can be declared** (superseded detail, retained for the reasoning) (`scripts/api-toast.js`, `scripts/blacksmith.js`, `styles/window-form-controls.css`): `api.toast.registerChannel(name, {moduleId, label, description})` and `api.toast.getChannels()`. The settings field renders the declared channels as tickable rows - "Critical Hits (coffee-pub-bibliosoph)" - instead of a free-text box a GM must guess at. Blacksmith stores the name and the label and renders them; it never reads meaning into either, which is the same trust `registerMenubarTool` already extends to module-supplied titles and icons. **Registering that a string exists is not interpreting it** - the earlier refusal of a registry conflated those, and the cost was the session above.
- Three details the design turns on: the **text field stays** and remains the storage, so an unregistered channel keeps working and keeps its box; **choices are built at render**, so a module registering late still appears; and **a saved name that no longer resolves is kept and marked**, never dropped, because losing a setting when a module is disabled for one evening is worse than the problem being solved.
- Blacksmith declares its own `timer` channel (`scripts/timer-notifications.js`) like any sender, so it appears in the list beside the siblings' rather than being a name only one file knows.
- **The checklist reads as a list, and says what state it is in.** The first build inserted it into `.form-fields` - Foundry's flex row for the input - so a five-row checklist and a text box shared one cell at half width each, and every row showed ticked above a blank field with the explanation buried in a paragraph of hint text. It now sits in the `.form-group` below the field at full width, each channel on its own two-line row (name and module, description beneath) rather than badge and description wrapping into each other. A status line above the list says which of the three states it is in - all allowed, none allowed, or only the ticked ones - because "every box ticked, field empty" is correct behaviour that looks broken without being told. The hint shrank to two sentences.
- **Verify live**: with the field empty, an excluded user sees every channelled toast. Open Settings and confirm each declared channel appears as a ticked row reading "All channels allowed"; untick one and confirm the field fills in with the rest and the status line changes; re-tick everything and confirm it clears to empty. Type a name no module registers, reopen the form, and confirm it is still listed, still ticked, and marked as not currently registered.

### Added - toasts can reach an excluded user without Blacksmith knowing why

- **`channel` on a toast, and the `toastBypassChannels` setting** (`scripts/api-toast.js`, `scripts/settings.js`, `lang/en.json`): exclusion via `toastExcludedUsers` was all-or-nothing - right for a camera or stream account that must not have party chatter on screen, wrong for the case that motivates changing it, since the broadcast cameraman *should* see "FUMBLE!" and "CRITICAL!". A toast may now declare a free-form `channel`; a user listed in `toastExcludedUsers` still sees it when that channel appears in the new world setting. No channel means unchanged behaviour, so nothing existing shifts.
- **The design deliberately refuses a per-user event-kind opt-in**, which is the more obvious shape. Those kinds belong to sibling modules, so Blacksmith's settings UI would have had to enumerate `critical`, `fumble`, `injury` - carrying a vocabulary about dice outcomes it has no reason to know, and requiring an edit here every time a sibling invented a new announcement. Taking a **name from the sender** instead keeps the hub ignorant: `isToastBypassChannel` compares two strings and nothing else. The reasoning is recorded in `architecture-toast.md` under Boundaries, as the shape to reach for whenever a consumer needs Blacksmith to treat some of its events differently.
- The check stays receipt-side beside the rest of exclusion, so it changes what a client renders and never what was delivered - a bypass channel carries no implication of privacy. `channel` is plain data and rides both cross-client relays unchanged (they spread the payload rather than whitelisting fields).
- **`api.toast.isExcludedUser(user)` and `api.toast.isBypassChannel(channel)`** are now on the public surface. Both functions already existed; leaving them internal meant a module wanting to warn its GM that its announcements could not arrive had to read `toastExcludedUsers` and `toastBypassChannels` itself and re-implement the comma/trim/lowercase parsing - coupling a sibling to two setting ids and to a parsing detail that might reasonably change. Bibliosoph hit exactly that building a channel audit. Neither answer is a secret, so asking beats guessing.
- **Channel names are logged on first sighting** (`scripts/api-toast.js`): `toastBypassChannels` is a free string with no registry behind it, so a GM had no way to discover which names are live, and a name that nothing sends does nothing silently. The suppression log added alongside the channel was worse than useless for this - it fires on the *excluded* client, which is by construction the machine nobody is watching a console on. Each channel name is now named once per client in debug output as it is seen. That reports observed reality rather than a declared vocabulary: modules still register nothing, and a name appearing in the log is evidence it was sent, not permission to send it.
- **A persistent toast never bypasses exclusion, whatever its channel** (`scripts/api-toast.js`): `duration: 0` means the toast stays until dismissed, and exclusion exists precisely because nobody is behind that screen to dismiss anything - the setting's original justification was "a camera/stream account that cannot click a toast closed". A bypass channel carrying a persistent toast would park it on a capture surface for the rest of the session, recreating the exact fault exclusion prevents and making it permanent rather than eight seconds long. The `/stream` view is unaffected, being exempt from exclusion already.
- **The Send Toast window now lists excluded users, badged, and honours an explicit tick** (`scripts/window-toast-send.js`, `scripts/api-toast.js`): they were hidden outright on the reasoning that `show()` would drop the toast anyway. Channels made that wrong, and worse than it looked - a hidden user is absent from `_recipients`, so the socket handler drops the payload before `show()` runs and the channel is never even consulted. A GM had no way to reach a camera account deliberately. Excluded users are now listed with an "Excluded" badge, never pre-checked, never restored from a saved preference, and skipped by "Entire Party" the way offline users already were - reaching one is always a fresh choice. Ticking the box sends `bypassExclusion: true`, a new `show()` config that overrides both the channel check and the persistent-toast rule, because a human ticking a row marked Excluded has made exactly the decision the list exists to make. Automated senders must not set it; they have `channel`.
  - Quick Toast deliberately does **not** set it. It is party-wide with no recipient picking, so nobody chose to include an excluded account, and a camera account is not "the party". The two paths differ on purpose and the code says so.
- **Excluded-user names are validated; channel names still are not, and the asymmetry is deliberate** (`scripts/api-toast.js`, `scripts/settings.js`): a name in `toastExcludedUsers` matching no user in the world is a typo with no other reading, and it fails the wrong way round - the account meant to be excluded quietly keeps receiving everything. New `getUnknownExcludedUserNames()` reports them, and the setting warns the GM on change (on change only: a GM may legitimately list a user who has not joined yet, and a startup nag trains people to ignore it). Channel names get no such check, because an unrecognised one may simply belong to a module Blacksmith has never heard of - the rule being to validate what you can enumerate.
- **`getActive()` now reports `shownAt`** (`scripts/api-toast.js`): `Date.now()` at render, so a consumer can tell a toast's age. A watchdog client wanting to clear a toast nobody is present to dismiss previously had to poll `getActive()` and time first sightings itself, guessing at an age this side knew exactly. Pairs with the existing `persistent` flag, which marks the only toasts that never clear themselves.
- **Blacksmith's own timer announcements now declare `channel: 'timer'`** (`scripts/timer-notifications.js`), so "five minutes left" can reach an excluded camera account without handing it every other toast. Blacksmith names channels for its own toasts like any sender; the channels it sends are listed in `api-toast.md`. What it still never does is learn another module's names.
- The `toastBypassChannels` hint now says plainly that the names come from the sending modules and not from Blacksmith, that an unrecognised name fails silently, and that debug mode lists the ones in use. It no longer offers `critical`/`fumble`/`injury` as examples - naming them in Blacksmith's own settings text was the vocabulary creeping back in through prose.
- **Verify live**: add a user to Excluded Users and confirm they see no toasts; set Channels Excluded Users Still See to `announcements` and send `api.toast.show({title: 'CRITICAL!', channel: 'announcements'})` from the console - it renders for that user while an untagged toast still does not. Confirm the same through a relay, not just a local `show()`.

- **Verify live**: with a GM, a player who owns a character, and an account that owns only the party `group` actor all logged in, start a vote - only the character-owning player appears in the tally, and the group-only account is refused with a message naming character ownership. Close it: unanimity is reached when that one player votes, without waiting on the spectator.

## [13.15.0]

### Fixed — summoned creatures were tracked as party members, and combat history stored whole maps

- **A summon is not a party member, but every predicate in the statistics system said it was** (`scripts/api-core.js`, `scripts/stats-combat.js`, `scripts/stats-player.js`, `scripts/stats-party.js`, `scripts/stats-mvp.js`, `scripts/stats-cards.js`, `scripts/api-stats.js`, `scripts/window-stats-party.js`): a summoned creature is handed to its summoner's player so they can drive it, so it reports `hasPlayerOwner === true` for as long as it exists. Player ownership was the whole test, so summons accrued their own lifetime statistics, competed for MVP, and appeared as their own rows in the party window beside the characters. A single casting of Conjure Animals put six identically-named "Berserker" rows in one export; a cleric's Spiritual Weapon had its own attack record.
  - **There were three different definitions of "party member" in the codebase**, and the statistics system used the two loose ones — `hasPlayerOwner && !isToken` in the player and party lanes, and `hasPlayerOwner || type === 'character'` (an **or**, so wider still) in the combat and MVP lanes.
  - **One predicate now, `isPlayerCharacter` in `api-core.js`, requiring both a `character` sheet type and player ownership.** Every statistics site delegates to it, as does `getPartyMembers`. **NPCs are never party, whoever owns them** — that includes summons, animated weapons with their own stat blocks, and NPCs a player owns permanently. Ownership is accepted from an owner permission **or** a user's assigned character, since a sheet can be assigned without a permission entry.
  - **An intermediate design tried to be cleverer, and testing against the live campaign is what killed it.** It admitted permanent player-owned NPCs and screened summons out by `flags.dnd5e.summon`, which dnd5e stamps on actors its own Summon activity creates (`SummonsData#getChanges`, dnd5e 5.2.5). Run against the real world that flag matched **nothing** — those summons came from a premade-content module that copies actors instead. In the same directory sat an animated weapon, player-owned and persistent, indistinguishable from a familiar by every available signal. A sheet type is a fact and transience is a guess, so the rule became the one needing no inference.
  - The same live check found **eighteen plain monsters** — Bandit, Hydra, Ogre, Orc, Giant Octopus — carrying `playerStats` flags, sprayed across the actor directory by the old ownership test.
  - **Reading an NPC's statistics used to create them, which is why clearing them did not stick** (`scripts/stats-player.js`): `getPlayerStats` initializes on a cache miss, and it is called from the party window, the MVP ranking, and combat end. Guarding the two explicit initialization paths was not enough — a live cleanup cleared ten non-party records and the console shows all ten re-initialized before the next line of output, because clearing the flag triggered a re-render that read them straight back into existence. The party check now sits inside `initializeActorStats`, the only place a record is born, so every caller is covered. `getPlayerStats` returns `null` for a non-party actor rather than minting a record for it.
  - That return changed a long-standing assumption — `getPlayerStats` previously always returned something — so its call sites were audited. All but one already guarded; `_endTurn` (`stats-player.js:815`) dereferenced `currentStats.lifetime.turnStats` directly and would have thrown on the first monster turn after a cleanup.
  - **`isPlayerCharacter` had a dead branch and a hot-path cost.** Its "if we're passed an actor directly" case tested `entity?.type === 'actor'`, but an Actor's `type` is `'character'` or `'npc'` and never `'actor'`, so passing an actor fell through to `false`. Input handling now lives in one exported `resolveActorFrom` covering combatant, token, token document, actor, id and name. The four `postConsoleAndNotification` calls per invocation are gone; these predicates run per combatant per turn and are now pure.
  - Consequence worth knowing: killing a creature summoned by an enemy now counts as a kill, and a summon scoring a kill does not credit anyone. Both follow from summons not being party.
- **Combat history stored entire Scene documents instead of scene ids** (`scripts/stats-combat.js`): `_generateCombatSummary` wrote `sceneId: combat.scene`, and `combat.scene` is a resolved Scene *document*, not an id — so every token, wall, tile, light and sound of the map was serialized into each history entry. `combatHistory` is a world setting: it is loaded on every launch and rewritten at the end of every fight. Ten combats had grown it to **21.1 MB against roughly 40 KB of actual statistics**, and each entry was a stale snapshot of a map since edited. Eleven lines above, the `sceneName` lookup already resolved the id correctly; only the stored field took the wrong one. It now stores `combat.scene?.id ?? combat.sceneId ?? canvas?.scene?.id ?? null`.
- **A repair for data already stored** (`utilities/repair-stats-data.js`): a console macro that strips serialized scene documents back to their ids and clears statistics from actors that are not party. It is **self-contained, depending on no Blacksmith code**, because the world needing repair is by definition the one still running the unfixed module — calling the new API would have made the repair require the fix it exists to precede. It defaults to `DRY_RUN = true`, and **refuses to clear the record of a non-character actor that has acted** — landed a hit, dealt damage, healed, revived — unless `CLEAR_NONEMPTY` is set, so anything holding a real history is read by a human before deletion. Incidental figures deliberately do not trip that guard: a monster knocked out in a fight accrues an unconscious count and a turn count without ever having acted, and counting those buried the actors that mattered under seventeen that did not. Every non-zero field is named in the report, so a verdict never has to be guessed at. Both repairs are idempotent. Rehearsed against a real 48.9 MB export: `combatHistory` fell from **21.143 MB to 0.042 MB** with every statistic field byte-identical, only `sceneId` and `sceneName` differing, and all ten scene ids resolving to live scenes.
- **Verify live**: run `utilities/repair-stats-data.js` with `DRY_RUN = true`. It lists each combat carrying scene data with its size, and every actor holding a record with a verdict of KEEP, CLEAR, or REFUSE and its non-zero fields named. Every `character` should read KEEP and nothing else should. After applying, `game.settings.get('coffee-pub-blacksmith', 'combatHistory')` serializes to tens of kilobytes and the party statistics window shows the player characters only. Ending a fresh combat grows the setting by kilobytes rather than megabytes; summoning a creature mid-combat adds no row, no MVP entry, and no `playerStats` flag on the summoned actor, while the summoner's own totals still move. `node tools/check-design-tokens.mjs` and `node tools/check-settings-headings.mjs` both pass, and every file under `scripts/` passes `node --check`.

### Fixed — combat statistics recorded almost nothing, and lifetime statistics recorded everything nine times

- **A landed hit was banked as a permanent miss** (`scripts/stats-sources.js`, `scripts/stats-player.js`): a dnd5e activity card is posted on use and then *updated in place* as each part resolves, so the first sighting of an attack message has no d20 on it yet. `resolveAttackMessage` decides hit or miss by comparing the attack total against each target's AC, which with no total makes every target unknown — and that provisional state was being recorded, banking an attempt with no hit. Both lanes now require `typeof attackEvent.attackTotal === 'number'` before recording.
  - **The half that made it permanent was the dedupe.** The key is the message id, so the provisional sighting also marked the message processed, and the corrected resolution arriving moments later through `updateChatMessage` — the one carrying the roll and the real hit list — was discarded as a duplicate. The attempt could never become a hit. The deferral deliberately does **not** mark the key; leaving it unmarked is what lets the correction through, and the code says so where it would otherwise look like an oversight.
  - Visible symptom: a party hit rate of `0.0%` on the encounter bar for a fight in which every attack connected. `0.0%` rather than `0%` is diagnostic, since `_buildCombatAggregate` (`stats-combat.js:881`) returns the *number* `0` when no attack has been recorded and a `toFixed(1)` *string* once one has — so the decimal point proved attempts were being counted while hits were not.
- **One swing wrote nine hits to lifetime totals** (`scripts/stats-player.js`): `stats-combat.js` and `stats-player.js` consume the same chat messages independently, and only the first had a dedupe. Since midi-qol rewrites its card several times per swing and each rewrite re-resolves, lifetime actor flags gained a hit per rewrite — measured at nine for a single attack. New `_attackRecordedCache` / `_isAttackDuplicate`, shaped like the `_isHealingGivenDuplicate` already in that class. Existing stored totals are wrong and are not migrated; `api.stats.player.clearAllStats()` plus resetting the `combatHistory` world setting is the reset.
- **Damage was never recorded from the chat lane at all** (`scripts/stats-sources.js`, `scripts/utility-message-resolution.js`): two independent faults, either sufficient on its own.
  - `_onChatMessage` returned after resolving a message as an attack. dnd5e puts the attack and its damage on the **same** message, so every later update carrying the damage roll resolved as an attack again, hit the dedupe, and returned — the damage branch was unreachable for any attack card. The damage resolution is now a fall-through, deliberately not an `else`, and the comment says why so it is not "tidied" back.
  - `resolveDamageMessage` could not recognise damage on such a card either. It tested `dnd5e.roll.type === 'damage'` (the card reports itself as a usage) or a midi workflow id with no d20 anywhere (false — the attack's d20 is beside the damage). It now also accepts an activity card carrying damage rolls, identified from the rolls themselves by new `isDamageRoll`.
  - **And it would have reported the wrong number if it had resolved**: `hydrateFirstRoll` reads `rolls[0]`, which on a combined card is the attack d20, so the to-hit total would have been recorded as damage dealt. New `hydrateAllRolls` exported alongside it; `resolveDamageMessage` sums the damage rolls.
  - Visible symptom: damage dealt `0` and no biggest hit on the encounter bar, for a hit that took a target from 176 to 168.
- **`resolveAttackMessage` no longer logs every sighting** (`scripts/utility-message-resolution.js`): a raw `console.debug` that ran on every candidate message — roughly ten times per swing once a card's updates are counted — and, being raw, bypassed `globalDebugMode` so it could not be turned off. The handlers now carry that signal by logging decisions rather than attempts.
- The card lifecycle, the "provisional sighting must not mark the dedupe" rule, and the per-lane dedupe requirement are recorded in `documentation/architecture/architecture-stats.md` — all three are invisible from the code and were each learned by getting them wrong.
- **The encounter bar's three update clocks are now documented** (`documentation/architecture/architecture-encounter.md`): a table of what each readout reads from and when it moves. Round, turn, health, balance and challenge rating are current; the timers write DOM directly once a second; the live statistics trail by up to a second because they read the mirrored combat flag rather than the GM's memory; the lifetime standings change once per combat. The confusing part is that the refresh trigger and the data freshness are independent — an HP change refreshes the bar and re-reads statistics from a flag not yet written, so health moves and damage does not, then damage moves a moment later with nothing else happening.
- **Verify live**: with `globalDebugMode` on, one attack that hits logs `Attack deferred (no roll yet)`, then exactly one `Attack Resolved` with a real `attackTotal` and `hitTargetsCount: 1`, then one `Damage Resolved` with the damage total and bucket `onHit`; `Player Stats - Attack Data` prints once with `+1` hit. The bar's hit rate, damage dealt, and biggest hit all move.

### Added - readout widgets, so a chip says what kind of number it carries

- **Three new secondary bar item kinds** (`scripts/api-menubar.js`, `templates/partials/menubar-secondary-item.hbs`, `styles/menubar-widgets.css`): every readout on the encounter bar was `kind: 'info'`, which renders as icon plus text - so a rank, a quantity, a percentage and a person all came out identical and nothing about a chip said which it was.
  - **`statchip`** carries a `tone`: `neutral`, `good`, `bad`, or `record`. The tone colours the value and its icon, and `record` adds a hairline beneath. Tone describes what a *rise* in the number means for the reader rather than whether the number is large, which is why damage dealt is `good` and damage taken is `bad` though both climb through a fight.
  - **`portraitstat`** is a standing that belongs to a person: a round, ringed portrait with the value beside it, `rank` colouring the ring gold, silver or bronze. The frame keeps its size when empty, falling back to a placeholder glyph, so a standing changing hands never shifts the chips either side of it.
  - **`gaugechip`** renders a percentage as a ring plus its number. Built as a conic gradient masked into a ring rather than an SVG arc, deliberately: the sweep is a single custom property, so a value update is one style write with no markup to rebuild, and it inherits the row's sizing variables where an SVG would need its geometry recomputed per row height.
  - **They restore identity, not affordance.** Colour, weight and shape are used; a fill, a pointer cursor and a hover lift are not. That is the same reason `menubar-combatbar.css` strips the shared item chrome from the data row, and these must not put it back. Tone and rank colours are declared in `menubar-widgets.css` rather than taken from `--blacksmith-status-*`, which are picked for light surfaces and read fluorescent on this bar's warm row - the same finding that gave `getDifficultyChipColor` its own palette.
- **All seventeen encounter bar statistics now use them** (`scripts/manager-combatbar.js`): the per-person standings and both biggest-hit chips are `portraitstat`, the two hit rates are `gaugechip`, and the remaining quantities are toned `statchip`. The gauges are pushed a `percentProgress` alongside their formatted text, since the ring needs a number and the string was built for a reader.
- **The per-item markup moved into one partial** (`templates/partials/menubar-secondary-item.hbs`): the three zones each carried a full copy of the per-kind dispatch, so every kind cost three identical blocks and a fix applied to whichever zone the author was reading. `menubar-secondary-default.hbs` drops from roughly 290 lines to 70. The item partial registers before the bar partial that invokes it, because Handlebars resolves a partial at render time and a bar rendered in between fails rather than waiting.
- **`DISPLAY_KINDS` and `CHIP_KINDS` replace six inline kind enumerations** (`scripts/api-menubar.js`): switch-group handling asked `kind !== 'info' && kind !== 'progressbar' && kind !== 'balancebar'` in six separate places, so a new display kind had to find all six or be silently treated as a button - given an active state, counted toward a switch group, and offered a pointer cursor it does nothing with.
- Recorded in `documentation/architecture/architecture-menubar.md` (what the kinds are, where a new one is added, and the two load-bearing implementation choices) and `documentation/api/api-menubar.md` (the public surface, with an example per kind).
- **The chips say what they are in words** (`scripts/manager-combatbar.js`, `templates/partials/menubar-secondary-item.hbs`): an icon and a number is unreadable without learning the icons, which is a tax paid by everyone at the table forever. Each statistic now carries a word - Fights, Damage, Kills, Hit Rate, Dealt, Taken, Healed, Big Hit, Crits, Misses. On a `statchip` the word **replaces** the icon rather than joining it, because an icon and a word saying the same thing spend two glyphs of width on one meaning and this row has none to spare. The three challenge-rating chips keep their icon-only treatment, which was a deliberate choice recorded where they are registered.
  - `refreshStatReadouts` was pushing `label: ''` on nine items every refresh, which would have wiped the registered word on the first update. Those pushes are gone; the plates are the only items whose label is now live, because theirs is the character's name.
- **The MVP moved to the left zone as a nameplate** (`kind: 'nameplate'`, new): a large ringed portrait with the character's name and their standing on two lines, rather than an anonymous face competing for width in the middle. Its own kind and not a large `portraitstat` - the stacked text block is different markup, and a size flag would leave one kind rendering two layouts. Both lines are always rendered, holding a non-breaking space when empty, so the plate keeps its height and its neighbours never shift as a standing changes hands.
  - Both MVP items are **out of `READOUT_SUPPRESSION_ORDER`** now, deliberately and with a note saying so: moving them out of the middle zone is what stopped them competing for width, and suppressing them again would hand that width to chips that rank below them.
- **The combat bar's middle zone is left-aligned** (`styles/menubar-combatbar.css`): the shared zone is centred, which suits a row of buttons and not a list of readouts. A centred row that overflows loses items from *both* ends and gives the eye no fixed point, so the same chip sits somewhere different every time the set changes. Left-aligned, the ranking in `READOUT_SUPPRESSION_ORDER` becomes visible - what survives is what is leftmost - a chip appearing or dropping moves only what follows it, and the row reads as one continuous line from the MVP plate rightward.
- **The data row wrapped to two lines instead of suppressing readouts** (`styles/menubar-combatbar.css`): the shared `.secondary-bar-zone` rule sets `flex-wrap: wrap`, which suits a bar of buttons and not a fixed-height readout row - the row's height is `--blacksmith-combatbar-data-height`, so a second line is not taller, it is clipped and squeezed. One cause, three symptoms that did not look related:
  - The row showed two lines of statistics.
  - The statistics looked left-aligned out of combat and centred in combat with no rule changing between them, because **a wrapped flex row centres its last line** - one line out of combat, two in it.
  - **`applyReadoutOverflow` had never fired.** It decides what to hide by testing `scrollWidth > clientWidth`, and a wrapping row never satisfies that: it wraps rather than overflowing. So the ranking in `READOUT_SUPPRESSION_ORDER` had no effect at any width, and the row wrapped instead of dropping its least important readouts. `nowrap` restores both behaviours at once.
- **The gauge ring read as a broken circle** (`styles/menubar-widgets.css`): the unfilled remainder used a near-black track that vanished against the bar's dark row, so at 0% the dial disappeared and at 80% it looked like a gap had been cut out of the rim rather than a dial partly filled. The track is now a visible light neutral - it is the track that says "this is a dial", the fill only says how far round - and the rim went from 2.5px to 3.5px, below which the arc breaks into dashes at this size on a dark row.
- **The MVP plate is one line** (`styles/menubar-widgets.css`): name and standing sit side by side, separated by weight and colour rather than a line break. Stacked, it was the thing forcing the row to two lines, and the data row is a fixed height shared with every other readout.
- **The statistics sit where what is beside them says they should** (`styles/menubar-combatbar.css`, `scripts/manager-combatbar.js`): left-aligned out of combat, where the left zone holds the MVP plate and the statistics are that plate's supporting cast; centred in combat, where the left zone holds round and turn, which have nothing to do with them - butting them together implied a relationship that is not there. The state is written as an `in-combat` class by `syncDataRowState` after every render, because the row's template cannot work it out: out of combat it is handed `getIdleBarData()` and in combat the full payload, so there is no flag in the context to test.
- **The chips are two-tone pills** (`styles/menubar-widgets.css`): a dark label segment and a tone-filled value segment, reading as one badge. This is the broadcast-graphic treatment rather than the muted-readout one. It is the one place the "identity, not affordance" rule bends, so the other half holds harder - no pointer cursor, no hover, no lift, and a pill silhouette no button on this bar uses. Each tone now carries a fill *and* the ink that stays legible on it; light text on a mid-tone fill turns to mush at this size. The rules match `.secondary-bar-item` as well as the kind class, because `.combat-data-row .secondary-bar-item` strips radius and padding at 0,3,0 and would otherwise flatten the pill back to plain text.
- **Round and turn are pills too, without icons** (`scripts/manager-combatbar.js`): an hourglass beside the word "Round" said nothing the word did not, for width the row cannot spare.
- **The gauge is an SVG arc, not a conic gradient** (`templates/partials/menubar-secondary-item.hbs`, `styles/menubar-widgets.css`): the gradient was cheap to update but Chromium gives its edges no antialiasing worth the name, so at this size the rim came out stepped and the sweep boundary looked chewed. A stroked circle is smooth at any size. `pathLength="100"` redefines the circle's length as 100 units, so `stroke-dasharray: <percent> 100` is the sweep directly with no circumference maths and a value update stays one style write.
- **Both timer bars are one fixed width, and both health bars another** (`scripts/manager-combatbar.js`): `TIMER_BAR_WIDTH` is sized to the longest string either timer can hold - "PLANNING TIMER EXPIRED", 22 uppercase characters at the bar label size - plus 12px each side, and is deliberately not responsive: the two share one slot and hand off to each other, so a viewport-relative width made the row twitch at the handover. `HEALTH_BAR_WIDTH` matches the pair to each other, because unequal widths make unequal fractions look equal. The balance bar stays a different width on purpose.
- **The balance bar no longer looks like a third health bar** (`styles/menubar-combatbar.css`): it sat beside two of them using the same green and red. It is now two earthy tones - dry moss against burnt umber - close enough in value that neither side reads as "good", which is the point: it is a balance, not a score.
- **The gauge is a meter, not a ring** (`templates/partials/menubar-secondary-item.hbs`, `styles/menubar-widgets.css`): it was a ring twice - a conic gradient masked into one, then a stroked SVG circle - and both read badly for the same reason, which is the size rather than the technique. At this row's height a dial is about twenty pixels across: too little arc to judge a proportion from, and too little room for the rim to survive antialiasing at any thickness. A horizontal meter of the same width carries the same fraction at an order of magnitude more resolution and speaks the pill language the rest of the row uses.
- **A portrait chip says what its number is** (`scripts/manager-combatbar.js`, `templates/partials/menubar-secondary-item.hbs`): a face and a digit with no stated relationship is not a readout, it is a puzzle whose answer is in a tooltip. The standings now read "who - what - how much" on the chip itself, in the same two-tone pill as everything else, with the portrait squared into the pill's leading edge rather than floating beside it.
- **Pill text sat crooked** (`styles/menubar-widgets.css`): the two segments are different type sizes, and both used `em` vertical padding - which scales with each segment's own font, so their baselines drifted apart. Each segment is now a flex box centring its own text against a fixed pill height, which also makes every chip on the row the same height whatever is inside it.

### Added - spark readouts (`kind: 'sparkchip'`)

- **A value with its recent history behind it** (`scripts/api-menubar.js`, `styles/menubar-widgets.css`): columns rather than a polyline, and CSS rather than SVG - at this width a line is a pixel or two of slope per point and reads as noise, where columns read as a shape. `MenuBar.buildSparkBars` normalises a numeric series into column heights against the series' own maximum, because a spark is read for its shape and an absolute scale flattens every party whose numbers happen to be small. The latest column is brightened rather than the series being coloured by value: the question a spark answers is "where are we now against where we have been", and that needs one point marked, not twelve.
- **Campaign damage now carries a per-combat trend, and live damage a per-round one** (`scripts/stats-party.js`, `scripts/stats-combat.js`, `scripts/manager-combatbar.js`). Both series come from reductions that already existed:
  - `PartyStats._build` gathers `damageSeries` and `hitRateSeries` inside the walk that already reduces `combatHistory` for the totals, not in a second pass, and reverses them so a spark reads left to right as time does.
  - `getRunningCombatStats()` exposes `roundDamage`, normalised there rather than at the consumer: the stored round entries carry both `damageDealt` and a `damage` alias kept for template compatibility, and a reader picking the wrong one gets zeros with no error.
  - The bar still reduces nothing itself, which is the constraint the whole statistics design rests on.
- **Emphasis is a tier, not the default** (`scripts/api-menubar.js`, `styles/menubar-widgets.css`): the filled pill was built, it worked, and was then applied to every readout on the row - at which point nothing was emphasised, because emphasis is a contrast and there was nothing left to contrast against. Chips now carry an `emphasis` of `plain` (default) or `feature`, and the row has six ways of showing data rather than one: a plain word-and-tone-coloured-number for most of it, a portrait standing, a meter for proportions, spark columns for trends, the filled pill for the few that should be found without looking, and one nameplate. `plain` is deliberately close to the treatment the row had before the pills - the blend rather than a replacement. Only round and turn are features today.
- **The MVP plate rejoined the statistics** (`scripts/manager-combatbar.js`): in the left zone it sat beside round and turn, which made it read as part of the timing group - the one thing it has nothing to do with. It leads the statistics group in the middle zone instead, which is its actual subject.
- **The MVP plate hides until it has a name** (`scripts/manager-combatbar.js`): it is the loudest thing on the row, so an empty one is the loudest possible way to say nothing. Its `visible` predicates read the same sources its values come from, so it can never appear without content or linger without it, and both are null-safe by necessity - `getAggregateSync()` returns null while the party cache rebuilds and `getRunningStats()` is null before the first mirror of a combat, and in both cases "no data yet" and "no MVP" are the same answer. Both underlying reads change on events the bar already re-renders for, which is what an appearing item requires.
- **Two gaps, not one** (`styles/menubar-widgets.css`): within a chip the word and its number are one phrase and sit close; between chips the gap is now clearly larger. The shared group gap was 4px - smaller than the within-chip gap - so the row was actively mis-grouping, reading "MISSES 1" and "DAMAGE" as pairs instead of "MISSES" and "1".
- **The feature pill is asymmetric and bounded** (`styles/menubar-widgets.css`): squared at the word end and rounded at the number end, so it reads as a label leading into a value rather than as a lifted, clickable token - the shape points at the thing you came to read. The dark half also looked narrower than the light half at equal widths, which is an irradiation illusion: a light field on a dark ground appears to expand past its own edge. A hairline around the pill and a seam between the halves give the eye a stated boundary to measure instead of the glow.
- **The MVP plate trails the statistics rather than leading them** (`scripts/manager-combatbar.js`): leading the group it read as though every number after it were that person's, when they are the party's. Trailing the group it reads as the conclusion drawn from them, which is what an MVP is.
- **The statistics open the Party Statistics window** (`scripts/manager-combatbar.js`, `styles/menubar-combatbar.css`): the one interactive thing in a row of readouts, bound to the group rather than to each chip - seventeen individually clickable chips would imply seventeen destinations where there is one. Signalled with a pointer and a hover wash across the whole group, using `:has()` because the group element carries no id, only the items inside it do.
  - The no-affordance rule is restated rather than broken, in `architecture-menubar.md`: what it forbids is a **false** affordance, chrome that promises a click and delivers nothing. Where a readout genuinely is interactive the obligation flips and it must be signalled. The old wording ("identity, not affordance") read as a ban on interactivity, which is not what it was protecting.
### Fixed

- **Combat statistics did not survive a browser refresh** (`scripts/stats-combat.js`): the mirror to the combat flag writes whatever is in memory, unconditionally. That is correct while the client is the one accumulating and catastrophic when it is not -- and after a refresh it is not. `initialize()` restores from the flag exactly once, at `ready`, reading `game.combat` at that instant; `game.combat` resolves against the **viewed scene**, so a combat running on another scene reads as no combat at all. The restore then silently does nothing, memory stays at its defaults, and the next tracked event mirrors those defaults over a flag holding the whole fight. No error, and the flag was the only copy.
  - `_schedulePersistCombatStats` now refuses to overwrite a stamped flag with unstamped memory, and recovers from the flag instead. `combatStats.startTime` is the discriminator because `_onCombatStart` stamps it: memory without it has never been initialised for a combat, a flag with it has, and that pairing means the client lost its state. A genuinely new combat always carries a stamp, so a legitimate reset is never blocked.
  - Recorded in `architecture-stats.md` as a rule for any future writer of these flags, since the failure is silent and destroys the only copy.
  - **Verify live**: start a combat, fight a round or two, refresh the browser mid-combat, and confirm the encounter bar still shows the accumulated damage, hit rate and per-round spark rather than zeros. With `globalDebugMode` on, a recovery logs `Recovered state from combat flag instead of overwriting it`.

### Fixed

- **A claimed intent was accepted and then discarded** (`scripts/api-menubar.js`): `registerMenubarTool` stores a normalised copy of the caller's data rather than the object itself, and `intents` was not among the fields copied - so `hasIntentHandler` never found a claim, and the health bars stayed inert with Squire installed and correctly configured. Reported by Squire, who had shipped their side and could see registration succeed while the lookup failed.
  - The normalised copy is deliberate: a registration cannot smuggle in fields the menubar would then have to defend against. The cost is that every supported field must be listed there or it is silently dropped, which is now stated at that site. **Registration returning `true` means the tool was accepted, not that every field on it was** - a caller cannot tell the difference, which is why this was invisible from the consumer's side.

### Fixed

- **Elements carried both `data-tooltip` and `title`, so they showed two tooltips** (`templates/partials/menubar-secondary-item.hbs`, `templates/menubar.hbs`, `scripts/api-menubar.js`): Foundry renders `data-tooltip` itself and `title` is the browser's native tooltip, so an element with both shows Foundry's styled one and then the OS one drifting in underneath it a moment later. Thirteen elements had the pair - every kind in the secondary bar item partial, and the three menubar tool buttons. `title` removed from all of them, and from the two places `_applySecondaryBarValueRefresh` was writing it, since a value update would otherwise reintroduce the pair the template no longer writes.
  - The menubar overflow button had the opposite problem - `title` and no `data-tooltip`, so it used the browser tooltip alone - and is converted.
  - **Not swept beyond that**: 111 `title` attributes remain across ten other templates (chat cards, the skill check window, the pins toolbar), all of them `title`-only rather than paired, so none produce the doubled tooltip that was reported. Converting them is a real cleanup but a separate one, with behaviour to verify in surfaces this change did not touch.

### Fixed

- **A readout could be shown in part** (`scripts/manager-combatbar.js`): with the zones clipping, a chip that half-fitted was sliced rather than dropped - "ACCURAC" on the bar. A clipped readout is worse than an absent one, because absent is a decision and clipped looks like damage. A final pass now hides anything whose box is not wholly inside its zone, walking each zone from its trailing edge backwards (in a nowrap row the overflow is always at that end) and re-measuring after each hide, since removing one item pulls the rest back and the next may then fit whole. The ranked pass still decides *what* to drop; this guarantees the invariant that ranking alone cannot - it stops as soon as overflow clears, and it can exhaust the ranking while the row is still too narrow.
- **Suppression re-runs when the row changes width, not only after a render** (`scripts/manager-combatbar.js`): it was correct at the instant it ran and stale from then on. The sidebar collapsing or the window resizing narrows the row without re-rendering the menubar, leaving a decision made at a width the row no longer has - a clipped chip that no amount of waiting fixes. A `ResizeObserver` on the data row re-measures, deferred a frame so measuring does not re-enter the observation that triggered it, rebound per render since the row is rebuilt with the bar, and disconnected in `cleanupCombatBarEvents` so a long session cannot accumulate observers on detached nodes.
- **Suppression never fired, so readouts overlapped the health bars** (`scripts/manager-combatbar.js`, `styles/menubar-combatbar.css`): `applyReadoutOverflow` tested `toolbar.scrollWidth > toolbar.clientWidth`, and the toolbar cannot overflow by construction - the middle zone is `flex: 1 1 0` with `min-width: 0`, so it shrinks to absorb any shortfall rather than pushing its parent wider. Its contents spilled past its own edge and painted over the right zone instead, which is why the accuracy meter ended up sitting on the health bars while the measurement reported everything fitting.
  - A zone *can* overflow, so the zones are what get asked now, with a pixel of slack for sub-pixel layout noise. The zones also gained `overflow: hidden`, which stops the overlap at widths even a fully suppressed row cannot survive, and keeps the measurement working since `scrollWidth` still reports full content width on a clipped box.
  - **The live MVP plate is now suppressible**, ranked to drop first of the live set: it is much the widest thing in that zone, so dropping it buys back more than any two chips, and it is the one readout with a home elsewhere - the same standing is in the Party Statistics window that the group opens. The lifetime plate stays unsuppressible, since out of combat it holds the left zone alone and competes with nothing.
  - This is the second half of the `flex-wrap` fix earlier in this release. That one let the row overflow at all; without this one, nothing measured the overflow.

### Fixed - a natural 20 counted twice without midi

- **Crits and fumbles were double-counted on any table without midi** (`scripts/stats-player.js`). Two core paths incremented `lifetime.attacks.criticals` for the same swing - `_onAttackRoll` on `dnd5e.rollAttack`, and the chat lane - with no shared dedupe. Under midi both were suppressed and `RollComplete` counted once, so midi tables were right and everyone else's lifetime crit and fumble counts were double. This ran **opposite** to the undercounts fixed alongside it, which is what made non-midi figures untrustworthy in both directions rather than merely low.
  - **Deleted rather than deduped, and the reason matters.** The roll hook cannot see the chat message - its context does not carry one, as its own comment admitted - so there is no key both sides could agree on. More decisively: **hits and misses were already counted only by the chat lane**, so an attack posting no chat card is already invisible to these statistics, and counting its crit from the roll hook recorded a critical belonging to no attack. One authority for the whole attack is the consistent answer, not just the convenient one.
  - Removed with it: the `dnd5e.rollAttack` registration, the `dnd5e.rollDamage` registration (an explicit no-op kept "to avoid breaking existing registration"), and three methods on `CPBPlayerStats` left unreferenced by the deletion - `_normalizeRollHookArgs`, `_formatTime`, `_getMidiWorkflowId`. `CombatSources` and `CombatStats` have their own copies of the first two and still use them.
- **Verify live, with midi disabled**: roll a natural 20 and confirm the lifetime critical count rises by **one**, not two; confirm hit rate and damage still record normally, since the deleted hook was not what counted them.

### Fixed - three statistics that were midi-only, so two tables got different numbers from the same fight

midi-qol is **not** a dependency (`module.json` requires only socketlib and lib-wrapper), but several statistics were written only by midi handlers. Nothing errored on either table - the numbers simply differed, in both directions, which made cross-table comparison meaningless.

- **MVP was decided by a different formula depending on whether midi was installed** (`scripts/stats-sources.js`). `successfulOffenseCount` had four write sites, all midi: `_onMidiHitsChecked`, `_onMidiPreTargetDamageApplication`, and their socket twins. The chat lane never wrote it, so without midi it stayed `0` for every character - and because `0` is **finite**, the "fall back to hits" guards in `stats-mvp.js:94-96` and `:52` never fired. The offense term of every score was therefore zero and the `mvpHitWeight` setting was inert, leaving MVP to be decided by misses, crits, fumbles, damage, healing and kills alone.
  - **Now one `_countSuccessfulOffense(key, attacker, source)` helper with five call sites**, including the core chat lane. The four hand-written copies are gone; only the helper increments the field. Duplication was the mechanism here - the counter drifted out of parity precisely because adding a lane meant remembering to write the block again.
- **Player lifetime damage discarded anything it could not correlate** (`scripts/stats-player.js`): the branch logged "Unlinked Damage (skipped)" and recorded nothing, while the midi lane never reaches it. Every save or auto spell - Fireball, Magic Missile - therefore contributed **nothing** to lifetime damage without midi and its full amount with it. The *combat* lane has always recorded unlinked damage (`stats-sources.js:921`), so the two lanes also disagreed with each other: the same fight's combat summary and lifetime totals did not match. Unlinked damage is now recorded in the `unlinked` bucket, which counts toward totals and stays out of the onHit-only moments - the policy `stats-combat.js` already documents.
- **`stats-player.js` returned after the attack branch - the same defect already fixed in the combat lane.** dnd5e posts one activity card per use and updates it in place, so attack and damage arrive on the **same** message; returning meant every later update carrying the damage roll resolved as an attack again, hit the dedupe, and returned. midi hid it because `preTargetDamageApplication` supplies damage independently, so **without midi, weapon damage never reached lifetime stats at all**. The duplicate check is now a block rather than an early return, exactly as `stats-sources.js:888` describes for the lane that was corrected first.
- **Verify live, with midi disabled**: land a weapon attack and confirm lifetime damage rises (previously it did not); cast a save spell and confirm its damage is recorded as unlinked; finish a combat and confirm the MVP card shows a non-zero offense contribution. Then re-enable midi and confirm the same figures, rather than different ones.
- Remaining midi-first findings from the same audit - crits double-counted without midi, and "damage" meaning applied HP in one lane and rolled total in the other - are catalogued with file:line citations in `documentation/TODO.md`.

### Added - delivery, phase 1: how damage reached a target (records nothing yet)

- **`resolveDelivery(workflow)`** (`scripts/utility-midi-resolution.js`): `attack`, `save`, or `auto`, decided from the **activity** and never from the item type - a spell may carry an attack roll (Fire Bolt), a saving throw (Fireball), or neither (Magic Missile), and `item.type === 'spell'` distinguishes none of them. `attack` wins when an activity has both, because an attack that misses deals nothing while a save only decides how much.
- **`delivery`, `landedTargets` and `landedIsProvisional` on the attack event**, carried and deliberately not yet read by any statistic. **Landed is not the same question as hit, and for a save it is not the same set**: midi assigns `hitTargets = new Set(this.targets)` for any activity with no attack roll, so on a save-based activity `hitTargets` means *was targeted*. Read as a hit list it reports a Fireball that every goblin resisted as a clean hit on every goblin. The set that means "landed as intended" is `failedSaves`.
- **A `midi-qol.postCheckSaves` observer** (`CombatSources._onMidiPostCheckSaves`), because midi rolls damage **before** it checks saves - so at `hitsChecked` time a save delivery's `failedSaves` is still seeded to every target and has not been reduced yet. `postCheckSaves` is where it settles, which is why `landedTargets` from the builder is marked provisional for saves.
  - **It deliberately does not create a cache entry when none exists.** An absent entry is what sends damage down the `unlinked` path, so manufacturing one here would move that damage into `onHit` or `other` - a real change to recorded numbers, which belongs in phase 2. A phase whose whole promise is "changes nothing" has to keep it.
  - **Its log settles a question that reading midi could not.** Whether `hitsChecked` fires at all for a save-only activity decides what phase 2 even is: if it does, save spells inflate hit rate toward 100% and phase 2 recounts; if it does not, save damage is `unlinked` today and phase 2 is about linking it. One `WorkflowState_WaitForAttackRoll` returns `WaitForSaves` directly, skipping the state where `hitsChecked` fires, while another branch continues - and with several Workflow subclasses in a 1.7 MB bundle, static reading does not decide it. `hadCachedAttack` in the log does.
- **Settled: "saves forced" will count castings, not targets** (phase 3). One Fireball on five goblins is one forced save. Counting targets would make a caster's number scale with how many enemies happened to be standing together, which measures the encounter's geometry rather than the caster.
- Plan and phase breakdown in `documentation/plans/plan-save-delivery.md`; phases 2-4 in `documentation/TODO.md`. Three unused hook-id assignments removed from `stats-combat.js` while registering the new hook - `HookManager` disposes by context, so the returned ids were never read.
- **Verify live**: with debug on and a combat running, cast an attack spell, a save spell and Magic Missile; confirm each reports the expected `delivery`, that the save's `failedSaves` matches what happened at the table, and that **no statistic changes** - hit rate, damage and the biggest hit should read exactly as they did before this.

### Fixed - damage recording threw on every midi damage roll

- **`stats-player.js` still read the attack cache off `CombatStats`, where it no longer lives** (`scripts/stats-player.js`): the stats decomposition moved it to `CombatSources` in `stats-sources.js` and this call site was never repointed, so `CombatStats._attackCache` was `undefined` and `_onChatMessage` threw `Cannot read properties of undefined (reading 'get')` on **every damage roll that was not already in the player cache**. The handler aborted at that point, so the damage was never recorded. It now calls `CombatSources.getCachedAttack(key)`, the accessor that already existed for this. Six comments and a debug label naming the old owner were corrected with it, and the now-dead `CombatStats` import removed.
  - **This is the same class of defect the decomposition already produced twice** - a reference that survived a move, invisible to `node --check` because the symbol resolves and only the property is missing. A repo-wide audit of every `CombatStats.*`, `CombatSources.*`, `CombatCards.*`, `CombatMVP.*`, `CPBPlayerStats.*` and `PartyStats.*` reference against what those classes actually define now reports **zero** others.
- **Damage classification branched on a distinction it then discarded** (`scripts/stats-player.js`): it tested `itemType === "weapon"` first and both halves of that branch reached the same answer, so the four-branch classifier was exactly `hadHit ? "onHit" : "other"` - which is what `CombatSources` has always done in one line. Removed. It read as though a spell were classified differently from a weapon, which would be worth knowing if it were true.
- Three dead imports removed from the same file (`playSound`, `trimString`, `makeKey`).

### Removed - dead imports, one of which was holding a module cycle open

- **Four unused imports deleted** (`scripts/api-menubar.js`, `scripts/window-skillcheck.js`): `CSSEditor` and `SkillCheckDialog` in `api-menubar.js`, and `handleSkillRollUpdate` and `rollCoffeePubDice` in `window-skillcheck.js`. Each appeared only on its own import line. Both windows are still imported by `blacksmith.js` (and `window-gmtools.js` by `manager-sockets.js`), so nothing changed about what gets loaded.
- **`handleSkillRollUpdate` was the only edge making `blacksmith.js` and `window-skillcheck.js` a cycle**, and it was never called. Dead code is not merely inert here - it was shaping the module graph, and the cycle is gone with it. This also removed the reason to be careful about the other two: `blacksmith.js` imports `api-menubar.js` before either window, so `api-menubar.js`'s imports were pulling both forward in evaluation order, into a cycle. Untangling the cycle first made the rest a non-event.
- **A repo-wide scan found 74 unused imports; only these four were touched.** The rest are deliberately left for a separate pass, because the scan cannot tell two very different things apart: a genuinely dead binding, and a named import used to force a module to evaluate so its top-level registrations run. Twenty-eight of the 74 are in `blacksmith.js`, which is overwhelmingly the second kind - deleting those lines would silently unregister features. The correct treatment there is `import './x.js'`, not deletion, and it belongs in its own reviewable change rather than buried in this one.

### Added - a harness suite for the readouts

- **`utilities/tests/suite-readouts.js`**, registered in `test-harness.js`. The motion could not be verified by reading the code and barely by playing either - a flash fires when a number changes, and making a specific number change means rolling dice until the right one moves. So it shipped unverified, and when it did not appear there was no way to tell which link had failed. It turned out to be none of them: `prefers-reduced-motion` was reporting ON for a GM who had never set it, the bar was correctly inert, and one click of this suite said so.
- **Each check isolates one link**, so a failure names its own cause rather than restating the symptom:
  - **the rules reached the browser** - via `stylesheetContains`, which recurses through `@import` and so catches the silent "new stylesheet, no import, nothing styled" failure;
  - **a pushed value patches the node rather than rebuilding it** - the one to read first, since a rebuilt node cannot animate and that is a different bug from a missing rule, with a different fix;
  - **a changed value gets the flash class, and an unchanged one does not** - the second half asserts the rule that motion follows a value, never a render;
  - **a statistic is on the bar exactly when it has something to report** - run against whatever the world currently holds, so it means something in a fresh world and in a long campaign, and treating suppression as a legitimate reason to be absent rather than a gating failure;
  - **an item that appears is marked as entering, and its neighbours are not**;
  - **the class actually resolves to a live animation**, asserted on both the flash and the entrance by reading computed `animationName` rather than by confirming the `@keyframes` exist. The class being applied and the animation running are separate claims, and the gap between them is invisible from outside - a rule that stops matching leaves the class on the element and nothing moving, which looks exactly like working code. Two edits during this release landed in that gap: a wrapper selector that repeated the parent class, so every descendant rule inside it doubled the class and matched nothing, and a `@keyframes` left nested inside a style rule, where it is invalid and silently dropped. A keyframes-presence check passes through both.
- **Four interactive triggers** for the things only a person can judge: the flash and count-up, the record burst, the portrait crossfade, and a chip appearing. All push display-only values or register a throwaway item that removes itself - nothing writes to a flag, an actor, or a setting.
  - **A trigger brings its own chip when the bar has none.** The burst and crossfade triggers originally poked whichever real chip happened to be on the row, which the empty-state gating in this same release quietly broke: a record chip and a standing chip do not exist until someone sets a record or holds a standing, so in a world that has not had a fight the triggers reported a missing element. They now fall back to registering a demonstration chip of the right kind, wait for its entrance to finish so the burst or fade reads as its own event, and remove it a few seconds later. **Skipping would have been the wrong fix** - these exist so a person can *watch* an animation, and "come back after a combat" is precisely how the motion went unwatched long enough to ship broken twice. A real chip is still preferred when one is on the bar, so the trigger shows the true thing where it can.

### Changed - a readout with nothing to report does not appear

- **Every statistic is now gated on having data** (`scripts/manager-combatbar.js`): at the start of a fight the live set was six chips all reading zero, which is furniture rather than information. The bar fills as the fight develops, and a chip arriving is itself the news - the first kill puts Kills on the bar. The MVP plate already worked this way; this is the same argument applied to the rest.
  - **Zero is treated as absence rather than as a reading.** That is a judgement and it is the right one here: every one of these counters starts at zero and only rises, so "0 kills" and "no kills yet" are the same statement and the second needs no pixels. It would be wrong for a figure that can genuinely return to zero after being something else. Monotonicity also means none of them can flicker - each crosses its threshold once and stays. Accuracy is gated on an *attempt* rather than a hit, since 0% after a whiffed swing is a real reading.
- **An arriving readout animates in** (`scripts/api-menubar.js`, `styles/menubar-widgets.css`): `markEnteringItems` compares the rendered id set against the previous render rather than inspecting the DOM, because an item appearing is a structural change - the bar was rebuilt and *every* node is new, so "is this element new" cannot tell the one that arrived from the fifteen that did not. Nothing is marked on a bar's first render: opening a bar is not fifteen things arriving, and animating them all would turn a deliberate signal into a splash screen.
  - Width is deliberately not animated. Growing from zero would shove every chip to its right along the row for the duration, turning one arrival into the whole bar sliding - the same objection that kept scale out of the value flash.

### Added - the readouts move when their numbers do

- **Motion on the encounter bar** (`scripts/api-menubar.js`, `styles/menubar-widgets.css`, `scripts/manager-combatbar.js`). Four behaviours, all driven by a real value change and never by a render:
  - **A flash when a value changes**, in the chip's own tone - so damage taken flashes red and damage dealt green with no per-chip rule, because the tone already states what a rise means. Colour and weight only, never scale or position: a chip that grows shoves its neighbours along the row and turns one number changing into the whole row twitching.
  - **A count-up between the old figure and the new**, easing out so it reads as landing on a number rather than being cut off at one. Deliberately narrow: it runs only when both strings are a plain number carrying the **same suffix** - "12" to "19", "41%" to "58%". It refuses "8.4k" to "12.1k", where the suffix is a magnitude rather than a unit and interpolating the mantissa would display figures that were never true. Where it refuses, the value swaps and the flash still plays.
  - **A crossfade when a portrait changes hands**, because a hard cut hides the event entirely.
  - **A burst when a best falls** - the animation allowed to be loud. Two tiers, described below.
- **`burst` is a caller's signal, not an inference, and it now has two tiers.** The menubar can see a number rise; it cannot see that the rise set a best, because that is a comparison against history the menubar does not hold. `burst: true` marks a new best **for the current fight** - the common case, several times an evening - and `burst: 'record'` marks one that also beat the **campaign standing**. Anything truthy bursts, so a caller written before the tier existed is unaffected. The tiers exist because frequency and meaning trade against each other: identical treatment would either make the common one underwhelming or the rare one wallpaper.
  - **The burst never fired at all in a world with no lifetime record**, which is every fresh campaign and was the reporting world. The old test required `standingBiggest > 0` before anything could beat it, so the one case it excluded was the first record ever set - the guard meant to prevent a false record on missing data instead prevented every real one. It now fires on any new fight best, and the standing check only decides which *tier* plays.
  - **The trigger is a new best, not "is the best."** `_burstedBiggestHit` latches the amount already celebrated and only a *higher* swing fires again; the same swing is pushed on every refresh for as long as it stands, so an unlatched test bursts several times a second. The latch is scoped to one fight and clears on `blacksmith.combatSummaryReady` - clearing at combat *start* would hold the previous fight's best across the gap, so the next fight's opening swing would have to beat a number from a fight that was over.
  - **The tooltip reads from the standing, not from the latch.** Tied to the one-shot latch, "a new record" was true for a single refresh and false whenever anyone actually hovered it.
- **The burst is louder** (`styles/menubar-widgets.css`): the common tier is a thicker glowing ring expanding twice as far, plus a scale punch on the chip; the record tier adds a second ring chasing the first, a harder overshooting punch, and a gold drop-shadow on the chip itself. All transform, opacity and shadow - a transform does not reflow, so the chip can punch without shoving its neighbours along the row, which is the constraint that kept scale out of the value flash. The bursting chip is raised above its neighbours for the duration so the expanding rings are not clipped by the chip beside it.
- **The motion is not gated, and that is settled** (`scripts/api-menubar.js`, `styles/menubar-widgets.css`, `styles/toast.css`, `scripts/api-toast.js`): not on `prefers-reduced-motion`, and not on a setting of our own. A virtual tabletop is a game and choosing to play one is the opt-in; what happens here is a glow, a counting number and a short fade, none of it the spatial movement that media query exists to protect against.
  - Both were tried during this release and both are gone. The media query on Windows follows a single "Animation effects" toggle that an OEM image or a power profile will have set, so a GM who had never chosen anything watched the whole feature sit inert with nothing to distinguish it from a bug - which is exactly what happened in testing. A setting of our own was worse in a different way: it governed one bar's readouts while the rest of the suite animated freely, which is a promise of control that is not kept.
  - **The toast billboards were gated the same way and are not any more.** A billboard's entrance *is* the announcement, and it had been silently disabled for anyone whose machine reported a preference they never set.
  - Recorded as a settled decision in `architecture-menubar.md` and at both stylesheets, with the instruction not to add a gate back. If a future animation is genuinely violent - full-screen, parallax, sustained - that animation is the thing to reconsider, not the rule.
- **This is what Phase 1 was for.** Motion is only possible because the value-patch path leaves the node in place: the text on screen *is* the previous value, so a change can be detected by comparing against it. While every update destroyed and rebuilt the element, a flash keyed to a change would have fired on every unrelated render and a count-up would have restarted continuously. Recorded in `architecture-menubar.md`, along with the rule that a rebuilt node deliberately does not animate - a rebuild is not a change, and a bar that flashed every chip when combat state flipped would be announcing nothing.
- **Verify live**: land a hit and confirm the damage chip counts up and flashes green; take damage and confirm the damage-taken chip flashes red; land the hardest hit of the fight so far and confirm a burst fires *then*, not only when a campaign record falls, and exactly once rather than once per refresh; beat the campaign's biggest hit and confirm the louder two-ring tier; watch a standing change hands and confirm the portrait fades rather than cutting. All of it plays regardless of any OS or module motion preference, because there is no longer one to set.

### Added - composite values can say which parts are not the value

- **`valueParts` on a statchip** (`scripts/api-menubar.js`, `templates/partials/menubar-secondary-item.hbs`, `styles/menubar-widgets.css`): a plain string is a value and an object with `muted: true` is scaffolding. `"6 C | 3 F"` and `"2 of 4"` are both a value containing characters that are connective rather than numeric - a separator, a unit letter, the word "of" - and as one string those took the value's full weight and colour, so the pipe read as loudly as the numbers it was separating. Muted parts take the label's ink and a lighter weight, so Finesse reads as two numbers rather than five equal glyphs. Turn uses it for the same reason.
  - Optional, and a plain `value` behaves exactly as before: most readouts are a single number and should not pay for this.
  - **A unit is not scaffolding.** "2C" is one reading, so the letter takes the count's colour; muting it made the C look like an annotation on a bare 2 rather than part of what was being said. The test: if removing the text would leave the rest meaning the same thing it is scaffolding, and if removing it changes what the number *is*, it is not. Only the separator is muted in Finesse; only "of" in Turn.
  - Muted by colour and weight rather than `opacity`, which would fade the glyph edges and leave a separator looking blurred at this size.
  - The parts are declared at registration as well as pushed on update, because the patch path treats a change in part **count** as structure - a chip that started as one string would rebuild on its first update rather than patching.

### Changed

- **Round and Turn's numbers are the same size as every other value** (`styles/menubar-combatbar.css`): they carried a 1.1x bump on the theory that the scoreboard should be bigger, but the pill already sets them apart, and one type size larger than everything beside it made the row look mis-set rather than emphasised. The container does the emphasis; the type stays in the system.
- **The neutral feature pill is a dark badge, not a light one** (`styles/menubar-widgets.css`): Round and Turn were the brightest objects on the bar - a near-white fill on a warm dark row, louder than the MVP plate and louder than the gold, reading as a light-mode component dropped into a dark one. The other tones invert to dark-on-light because a tone is a *claim* about the number and should carry; neutral makes no such claim, it is the treatment for something that is merely always there, like the clock. It now takes its emphasis from **containment** instead - the same materials as everything around it, boxed - so it is still unmistakably a tier apart from a plain chip, which has no container at all, but it belongs to the row rather than interrupting it.
  - The label half lightens with it, and the seam between the halves does more work: on the neutral pill the two halves are close in value and the seam is most of what separates them.

- **The gold is toned down, and defined once** (`styles/menubar-widgets.css`, `scripts/manager-combatbar.js`): it read as a warning colour on the bar's warm dark row and pulled the eye past everything around it, which is the opposite of what a tone is for. Now an antique gold rather than a bright one.
  - It had been written out as the same literal in **five places across two files** - the record tone, the first-place rank ring, the spark columns, the difficulty palette's "medium", and the threat needle's inline colour - which is four too many to keep in step, as the first attempt to change it showed. There is now one `--blacksmith-widget-gold-rgb` triplet, with the translucent variants built from it via `rgba(var(...), a)` rather than restating the channels. The threat needle's registration passes no colour at all now, so the stylesheet is the only statement of it.

- **The in-combat damage spark matches the out-of-combat one** (`scripts/manager-combatbar.js`, `styles/menubar-widgets.css`): it is the same statistic in a different scope, and a reader who learns the shape of one should not have to learn the other. Both are now the same tone.
  - **The monsters' columns are a tint of the party's, not a colour of their own.** Two unrelated colours read as two unrelated measures; this is one measure with two subjects, so the second stays the same family and weight, pushed toward red just far enough to separate them. The comparison a reader makes is which column is *taller* - colour only has to say which side each belongs to, and more contrast than that answers the question before the data does. Equal value and saturation on both, so neither side looks like the important one.

- **The encounter balance marker is a gauge needle** (`styles/menubar-combatbar.css`): a triangle descending from the top edge to the middle of the bar, slightly transparent. The full-height rule it replaces cut the bar in two rather than pointing at a place on it, so at a glance the two halves read as separate bars; a triangle terminating halfway names a position and leaves the scale continuous underneath, which is what an analogue meter does and why the shape needs no explaining. Drawn with `clip-path` rather than the border-triangle trick, because the colour arrives as an inline `background-color` from the registered `markerColor` and borders would need it on properties the template does not set - and since `clip-path` also clips `box-shadow`, its definition comes from `filter: drop-shadow`.

### Added - a registered tool is callable from anywhere

- **`invokeMenubarTool`, `invokeIntent` and `hasIntentHandler`** (`scripts/api-menubar.js`, `scripts/blacksmith.js`): a tool used to be reachable only by clicking its own icon, so a second surface wanting the same behaviour had to reimplement it or reach into the owning module. Registration already knows what a tool does; these make that knowledge callable.
  - An **intent** is a capability a tool claims at registration (`intents: ['party-health']`), and a surface asks for the capability rather than for the module. That is what lets a Blacksmith surface integrate with a sibling without naming it: the combat bar opens a health panel when the party health bars are clicked, and Blacksmith has no health panel - naming another module's tool id in the hub would be exactly the coupling the module boundaries forbid.
  - Verified in play with Squire: they added `intents: ['party-health']` to their existing tool and the combat bar's health bars open their panel.
  - `hasIntentHandler` should gate the **affordance**, not just the call. The combat bar marks its data row `has-health-tool` only when something claims the intent, so the health bars become clickable with the capability and not before - an unclaimed intent is a false affordance in a different costume.
- **The combat bar's health bars open a health panel** when a module provides one (`scripts/manager-combatbar.js`, `styles/menubar-combatbar.css`). Inert readouts in a world without one.

- **Verify live**: open the encounter bar in and out of combat and confirm the standings show round ringed portraits, the hit rates show a ring whose sweep matches the number, and the quantity chips are toned - damage dealt green, damage taken red. Confirm no chip shows a pointer cursor or lifts on hover, that the bar still suppresses readouts as the window narrows, and that both bar rows size their widgets correctly.

### Changed — the menubar no longer rebuilds itself to change a number

- **A pushed readout value is written into the standing DOM instead of re-rendering the whole menubar** (`scripts/api-menubar.js`): `updateSecondaryBarItemInfo` ended in an immediate `renderMenubar(true)`, and because the pushed value fed the menubar fingerprint the render always took the full rebuild path. `CombatBarManager.refreshStatReadouts` pushes eighteen values in a row, so one statistics refresh destroyed and rebuilt the entire menubar eighteen times — on a bar section 9B of `architecture-blacksmith.md` calls performance-critical.
  - The fingerprint is split: `_secondaryBarStateSignature` keeps what only a rebuild can express (a custom template's `data`, switch selection, toggle buttons) and feeds the structure fingerprint, while pushed readout values drive `_applySecondaryBarValueRefresh`, which patches value, label, tooltip, portrait, icon colour, bar fill and marker position in place. It reports failure for anything needing an element added or removed, and that case falls through to the rebuild it always did.
  - **Values no longer depend on a render happening.** The patch is applied synchronously where the value is pushed, so a coalesced or starved render cannot leave a figure frozen at what it was registered with. The render that follows is for consumers that re-measure afterwards — the combat bar re-runs its overflow suppression, and a wider number changes what fits.
  - A push patches only the item it pushed. Sweeping every pushed value per call meant one refresh made twenty-five passes over the same twenty-five items.
  - Only the ways *out* of the patch are logged. The success path runs on every pushed value and every render, and logging it buried the console.
  - This also makes animated readouts possible for the first time: a node destroyed and recreated on every update cannot carry a transition tied to a real value change.

### Fixed

- **One combatant without hit points broke the combat tracker for every other row** (`scripts/ui-combat-tools.js`): the health-ring code read `actor.system.attributes.hp.value` directly, and `hp` is optional — a dnd5e `group` actor carries members rather than hit points, and a combat can hold any actor type at all. The read threw inside the `renderCombatTracker` hook, which took the whole callback down mid-loop, so every combatant after the offending one lost its ring, portrait state, and controls. The visible symptom was a broken tracker; the cause was one unusual row.
  - Both reads in that file are guarded now. Where a ring cannot be drawn the container is **removed** rather than skipped, since a re-render may otherwise leave a ring drawn before the actor changed. An actor with no hit points is also never marked dead — it cannot be at zero of something it does not have.
  - A sweep for the same pattern found one more in `scripts/xp-manager.js`: `detectMonsterResolution` read the same path in all three of its branches. It now returns `UNKNOWN` when there are no hit points, which is what UNKNOWN is for — there is no evidence either way. The two reads in `manager-combatbar.js` were already guarded and needed nothing.

### Added — the encounter bar's statistics set

- **Eleven more readouts, and the plan behind them is complete** (`scripts/manager-combatbar.js`): the bar showed three figures out of combat and three in one, chosen as a starting point while the rest of the machinery landed. Every remaining number was already reduced and sitting unused — `getRunningStats()` returns fourteen fields and the bar read three; `stats.party.getAggregate()` returns fifteen and the bar read three. Nothing here needed API work, which was the point of the earlier phases.
  - **Out of combat, now ten**: the existing biggest hit, most fumbles, and top MVP, plus **most criticals** — the mirror of most fumbles, since showing the shame without the glory read as an odd omission — **most hits**, **fewest misses**, and four campaign-scale figures: **total damage**, **total kills**, **combats fought**, and **average hit rate**, which is the out-of-combat counterpart to the live hit-rate chip.
  - **In combat, now seven**: the existing damage dealt, hit rate, and biggest hit, plus **kills** and **damage taken** (damage dealt alone says how the party is doing to the fight; these say how the fight is doing to them), **healing given** — without which a healer's entire contribution was invisible until the fight ended — and the **leading MVP** as a portrait chip.
  - **They do not all fit, and that is the design.** `READOUT_SUPPRESSION_ORDER` decides what a given bar width actually shows, so it is now a ranking rather than a tidy-up: campaign-scale figures drop first, since they change once per combat and the Party Statistics window has them any time, then the secondary standings, then the three originals in each set. Adding a readout now means deciding where it sits in that ranking, not merely registering it. Recorded in `architecture-encounter.md`.
  - Party-scale totals carry **no portrait**, deliberately — they belong to the party rather than to anyone in it — and pass through a new `compactNumber()` rendering thousands as `8.4k`, since a lifetime total reaches five or six digits over a campaign and a chip is about four characters wide before it pushes its neighbours out of the bar. The exact figure stays in the tooltip.
  - `mostMisses` is ranked **low-is-best** by the aggregate, so that chip means "fewest misses" and its tooltip says so. Without that wording the number reads as an accusation rather than a credit.
  - The live set is renumbered from 10 so the two sets cannot interleave. They are mutually exclusive through their `visible` predicates today, but ordering that only holds because of a predicate is ordering waiting to break.
  - `documentation/plans/plan-encounter-bar-stats.md` is **deleted** — all four phases are done, its mechanics live in `architecture-encounter.md` and its caching design in `architecture-stats.md`. Two `TODO.md` items went with it: the `stats.party` aggregate (shipped in phase 1; `window-stats-party.js` no longer carries its own reduction) and the middle-zone readouts themselves.

## [13.14.2]

### Added

- **`api.compendiums.search()` — browsable multi-result lookup** (`scripts/manager-compendiums.js`, `scripts/api-compendiums.js`): the `resolve()` family answers "what is this thing?" — one name in, one best match out — and `resolveMany()` answers it N times, returning N winners for N names. Neither can express "what matches this text?", which is what a search-as-you-type picker needs: one query in, many candidates out. `search(query, type, options)` returns `{uuid, name, type, img, source, sourceLabel, sourcePackage, matchType}` per candidate. Requested by Squire for a quick-add tray that types "long", gets Longbow / Longsword / Longship grouped under their compendiums, and adds by UUID on click. It belongs here rather than in the consumer because `_getPackIndex()` already caches every pack's normalized index, dedupes concurrent callers onto one in-flight promise, declines to cache failures, and invalidates on `updateCompendium` — a consumer reading pack indexes itself would build a second cache over the same data with its own invalidation, and the two would drift after any compendium edit. The search is a filter over data Blacksmith already holds warm.
  - **Three deliberate differences from `resolve()`**, all documented as such in `documentation/api/api-compendiums.md`. **Ordering is source-then-tier, not tier-then-source.** `resolve()` exhausts the exact tier across every source before trying `startsWith` anywhere, which is correct when picking a single winner — an exact hit in Priority 3 should beat a prefix hit in Priority 1. For a browsable list it is wrong: it interleaves packs and destroys the grouping the list is read by. `search()` walks sources in configured priority order and sorts by tier within each, alphabetically within a tier. **`fuzzy` defaults to true**, so "sword" surfaces "Longsword". **`itemType` filters strictly** rather than preferring-with-fallback; `resolve()` falls back to the unfiltered set when a subtype yields nothing, which is right for one answer and wrong for a list — a weapon picker must not quietly list potions.
  - `limit` (default 50) is load-bearing, not cosmetic: a two-character query against the full SRD plus third-party packs is thousands of hits rendering into a narrow tray column. It caps in the API so no consumer reinvents it, and it stops the scan — once reached, remaining sources are never indexed, so a low limit truncates the tail of the priority order rather than sampling across it. `minLength` (default 2) returns `[]` without scanning at all.
  - **`documentClass` on every result**, beside `type` — the Foundry document class (`Item`, `Actor`) next to the document subtype (`weapon`, `npc`). Both are needed and they answer different questions: a row badge wants the subtype, a drag payload wants the class. Synthetic types make it load-bearing, since a `Spell` result is `documentClass: 'Item'`, `type: 'spell'`. Requested by Squire, who was otherwise carrying the class through by hand from the type token searched, because they merge Item, Spell, and Feature results into one list before rendering. It was already computed at result-construction time, so exposing it costs nothing and removes a way to build a drop payload no sheet accepts. Blacksmith's own palette had the same derivation and now reads the field.
  - **`searchDetailed()` reports what the scan covered** — `{results, truncated, searchOrder, scannedSources, skippedSources}`, with `search()` reduced to `searchDetailed().results`. Because `limit` stops the scan rather than only capping output, a caller holding the array could not distinguish "that pack had no matches" from "that pack was never opened". Squire flagged this as invisible from the API's side and was inferring it from `results.length === limit`. **That inference over-reports**, and the fix is not cosmetic: a scan that fills the cap exactly with the last available candidate is complete, not truncated, and would have been reported to the user as missing content. `truncated` is now set only where a candidate genuinely could not be emitted or a source was left unopened — the cap check sits before the push, so reaching it proves another candidate existed. The palette's status line uses it, replacing the same faulty inference it had been making, and names how many compendiums went unsearched. Every field is scoped to one call; the doc says how a consumer fanning out across several types should combine them, since union and intersection answer different questions and neither is the sum of the per-call counts.
- **`api.compendiums.getAllPacks()` / `getAllChoices()` — the unfiltered compendium list** (`scripts/manager-compendiums.js`, `scripts/api-compendiums.js`): every mapping method answered one question — "which compendiums did the GM pick for searching" — and there was no way to ask the other one, "which compendiums exist". Requested by Bibliosoph, which needs the user to nominate a journal compendium for injuries and specifically wants one that is **not** in the search set, so the search-shaped list is exactly the one that cannot offer it.
  - `getChoices()` narrows twice over: it drops packs from disabled sources, and applies the content heuristics in `utility-compendium-auto-map.js` — a `JournalEntry` pack must pass `isPrimaryJournalCompendium`, a `Spell` pack must actually contain spells. Correct for a search mapping, and precisely wrong for "let the user pick any journal compendium". `getAllPacks()` applies neither, matching only on the pack's document class via `getPackType()`, which is the same predicate the heuristics start from.
  - **Synthetic types deliberately return every pack of their document class** — `getAllPacks('Spell')` returns all Item packs — because content sniffing is the filter the method exists to escape. Documented rather than special-cased, since the alternative is a method that is unfiltered except when it isn't.
  - Structured, not display strings, per the `sourceLabel` lesson earlier in this release: `{id, label, package, displayLabel, documentClass, subtype, isWorld}`. `displayLabel` comes from the shared `formatPackLabel()` rather than being rebuilt, so the composed form cannot drift from the one settings dropdowns use. `getAllChoices()` is the dropdown-ready `{id: label}` projection, shaped like `getChoices()` so it drops into a setting's `choices` unchanged; `{none: false}` omits the leading None entry.
  - The harness asserts the result is a strict superset of `getChoices()` for four types, that every installed pack of the class is present and nothing of another class leaks in, and that `label` and `package` stay discrete. It logs how many packs are reachable *only* through the new method — in a world where that number is zero, nothing is being hidden and the gap is the whole point.
- **`search()` and `searchDetailed()` accept an array of types** (`scripts/manager-compendiums.js`): `search('long', ['Item', 'Spell', 'Feature'])`, or `getTypes()` for everything mapped. The scan became source-major — each compendium is opened once and every requested type reads from it — rather than running the whole thing once per type. Three reasons it belongs here rather than in each consumer's fan-out. **Grouping survives**: N separate calls each group by source independently, and merging them re-interleaves the packs, undoing the ordering the API exists to provide. **Deduplication**, which is correctness and not tidiness: synthetic types share packs with `Item`, so a pack mapped to both `Item` and `Spell` hands its spells back through both passes — the Item pass unfiltered, the Spell pass subtype-filtered over the same entries — and a caller-side merge double-lists every one of them. Deduped by uuid at bucketing time so a doubled entry cannot occupy two slots, first type winning. **One budget**: `limit` is the total, where three calls at `limit: 40` can return 120 rows and each reports truncation against its own slice, producing numbers no consumer can reconcile. Duplicate and aliased tokens collapse (`['Item', 'item']` is one type); an empty array returns nothing; `searchOrder` in a report is the union of the per-type orders in the order given, first appearance winning.
  - **Source identity comes back as three discrete fields**, not one display string: `source` (the id), `sourceLabel` (the pack's own name), and `sourcePackage` (the module, system, or world shipping it). The first cut took `sourceLabel` from `getChoices()`, which was wrong: those are settings-dropdown strings that glue three facts into one line — a real one in a live world reads `"Dungeons & Dragons Player's Handbook: Equipment — 42 Weapons, 59 Equipment, 55 Consumables, 37 Tools, 35 Loot, 30 Container"`. Correct in a `<select>`, unusable as a heading, and no consumer should have to parse it apart. `sourceLabel` is now `pack.metadata.label` and the package half is its own field. This also means `sourceLabel` alone is deliberately ambiguous — several packages ship a pack called "Equipment" — so a grouped list should render `sourcePackage` alongside it. The harness asserts each of the three specific ways the composed string used to leak through, so a failure names which one came back.
  - `getPackPackageLabel(pack)` is a new export in `compendium-types.js`, and `formatPackLabel()` is now written in terms of it rather than recomputing the same package resolution inline. The composed `"Package: Pack"` form is unchanged for its existing callers.
  - Tiers are mutually exclusive per candidate (new `classifyMatch()` helper), so nothing appears twice in one result set.
- **`img` on cached index entries** (`scripts/manager-compendiums.js`): `_getPackIndex()` kept `{name, type, uuid}` and `_getWorldEntries()` kept the same three. Both now carry `img`. `pack.getIndex()` already returns `img` in Foundry's default index fields for document types that have one, so this is one more field in the existing `.map()` — no extra fetch and no new I/O. Without it every picker row renders a placeholder or round-trips `resolveDocument()` per row, which defeats the point of searching an index. Types with no `img` in their index (JournalEntry) get `null`.
  - **Verification — 57/57, verified 2026-08-02.** A new harness suite, `utilities/tests/suite-compendiums.js`, registered in `utilities/test-harness.js` — 11 headless checks plus an interactive search-as-you-type picker preview. Every check derives its fixture from the live world rather than naming specific content, so the suite passes in any world with an Item mapping rather than failing loudly on unfamiliar compendiums, which is how a harness trains its reader to ignore it. The three deliberate divergences from `resolve()` are asserted directly, since a future reader would otherwise "fix" them back; the `itemType` one is asserted against a subtype that cannot exist, which separates filter from prefer with no dependence on world content — filtering returns nothing, preferring falls back to everything — and the same call through `resolve()` is asserted to still find the entry, so an accidental merge of the two semantics fails loudly. Ordering is checked structurally (each source forms one contiguous run, the runs are an ordered subsequence of the configured priority order, tier rank never decreases within a run, names are alphabetical within a source+tier run) rather than against expected names. The live run proved grouping across **10 configured sources**, and the picker preview measured ~5ms per query once the indexes were warm against a 2,154-hit corpus.

### Removed — automatic compendium mapping and the source checkboxes

- **Compendium mapping is manual again, and simpler by about 400 lines** (`scripts/settings.js`, `scripts/manager-compendiums.js`, `scripts/compendium-types.js`; `scripts/utility-compendium-auto-map.js` deleted outright). Three mechanisms went: the **Included Sources** package checkboxes, **Auto-map Compendiums on Next Load**, and the content heuristics that decided whether a pack was a "primary" spell, journal, feature, or item compendium.
  - **Why.** Auto-map filled *every* slot, because the slot count was derived from how many compendiums were eligible rather than how many the GM wanted. A package with thirty compendiums produced thirty slots and thirty filled dropdowns, and undoing that meant setting each one back to "none" by hand. Choosing the two you want was always less work than deleting the twenty-eight you don't. Its tier ordering never guessed priority correctly either, and priority order is the part that matters.
  - **Priority Slots is a per-type number again** (`numCompendiums{Type}`, 0–20, a visible slider). `requiresReload`, because Foundry fixes a setting's `config` flag at registration, so the number of visible dropdowns can only change on the next load. 20 is a flat ceiling on purpose: the count should reflect how many sources a GM wants to search, which is small, not how many are installed, which is not.
  - **Existing worlds keep their mapping.** The slider's default is seeded from the highest slot each type already has configured, read from raw storage because it runs while the slot settings are still registering. More slots are *registered* than shown when a world holds values further down, so lowering the slider hides those picks rather than destroying them — raise it again and they return.
  - **Every dropdown now offers every compendium that can supply its type** — document type matches, and for a synthetic type the index actually contains that subtype (new `compendiumOffersType()` in `compendium-types.js`). Nothing else. The removed heuristics withheld legitimate compendiums with no user-facing override, which is how a perfectly good journal compendium could not be chosen at all; and since the priority slots are themselves the curation, a longer menu costs nothing.
  - **The runtime veto is gone.** `getMapping()` used to re-filter saved picks against enabled packages and eligibility on *every lookup*, so a pack could sit visibly in a priority slot and silently never be searched while the settings page still showed it as configured. Now what is in a slot is what gets searched; the only entry dropped is one whose pack no longer exists in the world.
  - `indexEntries()` and `describeCompendiumContents()` moved to `compendium-types.js`; the rest of the auto-map module was deleted rather than left dormant, and seven now-dead localization keys were removed with it.
  - **One wrinkle to check after upgrading:** `Scene` was the only "source-aggregated" type, and its slots stored `source:<package>` values rather than pack ids. Those no longer resolve and are skipped, so a Scene mapping needs re-picking from the ordinary per-pack dropdowns. No other type stored values in that form.

### Fixed

- **Form fields ignored the Tool window theme** (`styles/window-tool.css`): the shared form-control classes in `styles/window-form-controls.css` are built for Blacksmith's dark standard windows and hard-code a `#222` surface with light text, so every input, select, and textarea inside a Light or Glass Tool window rendered as a black box floating on parchment or frost. Found on the Compendium Search palette under Glass, but it was never that window's bug — it applied to any Tool consumer with a form, and each would have had to hard-code its own field colors and re-derive them per theme.
  - The Tool shell now owns a `--blacksmith-tool-field-*` family — background, border, text, placeholder, focus border and ring, and a separate `option` pair — defined for all three themes beside the existing `--blacksmith-tool-*` variables, with rules that apply them to fields inside `.blacksmith-window-tool`. A consumer writes an ordinary `<input>` and it follows the user's theme with no theme-aware code. Both the shared classes and bare elements are targeted: a consumer who wrote plain `<input>` had the identical collision, and the shell should not reward only those who knew the class existed. Buttons are deliberately untouched — they are already themed, and repainting them would flatten the header controls.
  - **An open `<select>` dropdown is an OS popup and inherits nothing from the page**, which is why it gets its own explicitly opaque pair rather than reusing the field surface. Under Glass the field is translucent by design — an opaque field on a frosted shell reads as a hole punched through it — but a translucent `option` value renders as the browser default and collides all over again.
  - `.blacksmith-select` draws its chevron as a `background-image` with a fixed light fill, invisible against a Light field; it is now recolored per theme. A search input's native clear glyph is inverted on the two dark themes for the same reason.
  - Scoped to the whole window rather than the body, because the tool bar and footer hold controls too — a search box in the tool bar being the common case.
- **Players could see and change six settings that are the GM's to decide** (`scripts/settings.js`): `combatTrackerShowHealthBar` and `combatTrackerShowPortraits` were `user`-scoped, so each player toggled their own — a player could switch health bars back on after the GM chose to conceal them. Both are table-wide presentation calls and are now `world`. The four Quickview settings (`enableQuickViewFeature`, `quickViewEnabled`, `quickViewDarknessAlpha`, `quickViewSightHighlightColor`) were also `user`-scoped despite Quickview being GM-only in every other respect — its keybinding is `restricted: true` and its handler returns early for a non-GM — so players were shown four controls that did nothing. All four are now `world`, and the **Vision** heading with them. Existing per-user values for these six are abandoned and the world default applies; for display toggles that is the intended reset, not a loss.
- **Two headings appeared to players with nothing under them** (`scripts/settings.js`): **Vision**, now that its whole subtree is GM-only, and **Quality of Life**, whose only other setting (`objectLinkStyle`) was already `world`. Both are now `world`. Quality of Life looked populated because `coreLoadingProgress` sits beside it in the file — but that setting is registered from `blacksmith.js:893` during `init`, while `registerSettings()` runs in `ready`, so it is the *first* Blacksmith setting registered and renders above every heading rather than under this one.
- **Verified that settings headings reach players, and added a check so they keep doing so** (`tools/check-settings-headings.mjs`): Foundry hides world-scoped settings from non-GM users — `client/applications/settings/config.mjs:67`, `if ( !setting.config || (!canConfigure && (setting.scope === CONST.SETTING_SCOPES.WORLD)) ) continue;` — and only `world` is hidden, with `client` and `user` both rendering. Headings in `settings.js` are ordinary String settings and obey the same rule, so a world-scoped heading above a client- or user-scoped setting would reach a player as a bare control with no context, making two identically-named "Enable" toggles from different sections indistinguishable.
  - **The audit found no such case.** All 34 player-visible settings already keep their full heading chain, ancestors included. The correct scoping accreted feature by feature rather than in one pass, which is why it was never obvious that it held. The check exists so it stays that way: a setting whose scope changes from world to user can silently orphan itself under a GM-only heading, and nothing else would catch it.
  - Errors on a heading hidden from players who can see settings beneath it; warns on a player-visible heading with nothing under it, and on a player-visible setting with no heading at all. `headingH1GettingStarted` and `headingH4Introduction` are allowlisted with reasons — a heading renders its hint as body text, and those two are the module's intro prose, deliberately shown to everyone. Listing them rather than tolerating them silently keeps a genuinely new empty heading visible.
  - Two parsing details that would otherwise produce false alarms, since a check that cries wolf gets ignored. **Nesting comes from `registerHeader`'s level argument, not the H-number in the label key** — they disagree in several places (`headingH3CampaignCommon` is registered at level H2). And **a setting registered inside a helper is attributed to the helper's call site, not its definition**: `ensureCoreLoadingProgressSettingRegistered` is defined at the top of the file and called under a heading 1,300 lines below, which the naive reading reported as both an orphaned setting and an empty heading — two false alarms from one artifact.
  - Verified by running it against a copy with one heading flipped to `world`: it names the heading, lists the six settings it orphans, and exits 1. It takes a path argument for exactly that purpose. Settings registered outside `settings.js` (`manager-pins.js`, `sidebar-combat.js`) are both `config: false` and never render; the dynamic compendium-type registrations use template-literal keys the check skips and are internally consistent, a world heading over world settings.
  - **A helper called from another script registers earlier than its position suggests**, and the check now says so. `ensureCoreLoadingProgressSettingRegistered` is exported and called from `blacksmith.js` during `init`, before `registerSettings()` runs in `ready`, so `coreLoadingProgress` renders above every heading. Resolving it to its in-file call site — under Quality of Life — reported it as correctly parented when a player actually sees it floating at the top of the list, and reported Quality of Life as populated when it is not. The check scans the other scripts for calls to `settings.js`'s exported helpers and flags their settings as registering first.
  - `--player` prints the settings list as a non-GM receives it, headings and all. That view is otherwise only obtainable by logging in a second client, which is why the scoping drifted unnoticed.
- **Compendium Search group headers read as black slabs under Glass** (`styles/window-compendium-search.css`): they were painted with `--blacksmith-tool-scrim`, which is nearly opaque under Glass — `rgba(12, 10, 8, 0.82)` against the shell's own title bar at `rgba(0, 0, 0, 0.4)`. Twice the weight of the window's own chrome, so the headings looked like foreign elements rather than part of the theme. They now use `--blacksmith-tool-surface-raised` with a `backdrop-filter: blur(6px)`, which masks the rows scrolling underneath just as well — smeared rather than hidden, which is all a heading needs — while sitting inside the frosted shell instead of punching through it. Under Light and Dark `raised` is already opaque and the blur costs nothing.
  - The guidance in `api-window.md` that sent me to `scrim` is corrected with it: a sticky element wants `raised` plus a blur, and `scrim` is for something that must stay readable over genuinely arbitrary content. The comment on the Glass token block had actually predicted this — "`raised` stays light-handed so a heading does not read as a slab punched through the frost" — and the first implementation did the opposite.
  - The headers also gained horizontal breathing room and rounded corners to match the windows around them, both from design-system tokens (`--blacksmith-space-sm` / `-md`, `--blacksmith-radius-md`) rather than chosen numbers. Their bottom rule came off with the rounding: a straight divider under a rounded filled bar hooks upward at both ends, and once the bar has its own surface the fill already does the separating.
  - Result thumbnails go from `border-radius: 2px` to `4px`; at 28px the smaller value reads as square.
- **The full Tool title bar was larger than an ordinary window's** (`styles/window-tool.css`): 42px tall with 20px text, against Foundry's own 36px with 13px (`foundry2.css:326`, `:6519`). Taller and half again the type size of the standard windows it sits beside — conspicuous on a presentation whose whole point is being the compact one. Now 30px with 15px text, sitting deliberately *under* Foundry's default rather than merely level with it, with the header controls dropped 22px -> 20px so they are not wall-to-wall in the shorter bar. The title keeps its condensed display face, which still carries at 15px where a body face would not. Micro mode is unaffected — it overrides `--header-height` to 14px on its own.
- **The micro title bar's menu button rendered no icon at all** (`scripts/window-tool-base.js`): it was built with the class `fa-dot`, which **is not a Font Awesome class** — it does not exist in Foundry's bundled set (4,892 classes; `fa-circle-dot` and `fa-ellipsis` do, `fa-dot` does not). So the trigger was a completely invisible button that could only be found by hovering blind until the tooltip appeared. Now `fa-ellipsis`, the ordinary "more" affordance, which suits a horizontal rail; the vertical ellipsis stays on the taller full title bar. A sweep of all 220 icon classes used across `scripts/` against Foundry's Font Awesome found no other phantoms.
- **The micro title bar had no Close button** (`styles/window-tool.css`): micro mode hid `[data-action="close"]` along with the title and the consumer's header actions, leaving the commonest action in the window reachable only through a context menu. Close is now shown, beside the menu trigger.
  - Both micro controls were also faded with `opacity: 0.28`, which dissolves a 9px glyph *toward the rail behind it* rather than dimming it. They are now muted by **colour** (`--blacksmith-tool-text-muted`) at full opacity, so the shape stays crisp at low emphasis and has somewhere to travel to. Hovering the rail brings both to `--blacksmith-tool-text`; hovering one takes that glyph alone to the house interactive orange, with no background plate — at 14px a filled hover box reads as a smear, and the icon is what you are pointing at.
  - Deliberately **not** `--blacksmith-tool-accent` for the hover: under Light that resolves to the same value as `--blacksmith-tool-text`, so landing on a control would have looked identical to hovering the rail.
  - While there: the shared header-control colour was a hard-coded parchment brown (`rgba(67, 49, 32, 0.78)`), invisible against the Dark and Glass title bars, and its hover plate was a hard-coded warm wash. Both now use the theme tokens — the same class of bug as the form fields above, found by looking for the next one.
- **Tool themes had no vocabulary for content, so consumers hardcoded colours** (`styles/window-tool.css`): the shell exposed frame concepts — background, border, divider, text, accent — and nothing for what a consumer puts inside it. Anyone building a list in a Tool window therefore had no theme-aware value to reach for and picked a literal, which is correct in one theme and wrong in the other two. Blacksmith's own new palette did exactly that: its row hover was a warm brown chosen for parchment and simply wrong under Dark and Glass.
  - Six properties added across all three themes: `--blacksmith-tool-surface-raised`, `-sunken`, `-hover`, `-selected`, `--blacksmith-tool-text-muted`, and `--blacksmith-tool-scrim`. **`raised` and `scrim` are deliberately separate**: `raised` is decorative and may be translucent, while `scrim` guarantees legibility over arbitrary content and is what a **sticky** element needs — under Glass the shell background is near-transparent by design, so a sticky heading painted with it lets scrolled rows read straight through. The two are near-identical under Light and Dark and differ sharply under Glass, which is the case they exist for. `text-muted` exists so consumers stop dimming with `opacity`, which fades an element's background and borders along with its text and compounds when nested.
  - `styles/window-compendium-search.css` was rewritten onto the set and now contains **no colour literals at all** — it follows Light, Dark, and Glass with no theme-specific rules of its own, which is the check that the vocabulary is actually sufficient rather than merely present. The Glass-only sticky-header override added minutes earlier is gone, replaced by `scrim` in the base rule.
  - Recorded in `api-window.md` along with the distinction that these are **component properties of the Tool shell, not design tokens**: global tokens live in `styles/vars.css`, are documented in `design-system/design-tokens.md`, and are enforced by `tools/check-design-tokens.mjs` — they carry one fixed value each and structurally cannot express a value that changes per theme. `check-design-tokens.mjs` still passes; nothing here belongs in `vars.css`.

### Added — Compendium Search tool window

- **A search-as-you-type palette you can drag out of** (`scripts/window-compendium-search.js`, `styles/window-compendium-search.css`): type, get candidates grouped under their compendiums in configured priority order, and drag a row onto a character sheet to add it. It is the reference consumer of `api.compendiums.search()` — the thing the API was requested for, built here so the hub proves its own surface rather than shipping it untried.
  - **Three ways in, one window.** The Blacksmith scene-controls toolbar (Utilities zone, `fa-book-atlas`, matching the system's own iconography); the menubar **left zone**, with the other always-available client tools rather than the middle zone's play-state tools (magnifying glass — the menubar reads as actions where the scene-controls row reads as subject matter); and **Ctrl+Space**. All three route through `CompendiumSearchWindow.open()`, which focuses the live instance rather than opening a second — the window has a fixed `id`, so two would collide in the DOM, and a palette is a thing you want one of.
  - The keybinding registers through Foundry's own system (`game.keybindings.register`, `openCompendiumSearch`) during `init`, since a later call is dropped. It is `editable`, so it appears in Configure Controls and can be rebound — worth knowing because Ctrl+Space is the keyboard-layout switcher on some Windows and macOS setups, where the OS will claim it first. Not `restricted`: players use this to equip their own characters. `blacksmith.js` now imports the window module for its side effects, which is what puts the `init` keybinding and `ready` menubar registration on the static import graph; the toolbar's `await import()` then resolves from the module cache and costs nothing.
  - The menubar button can be turned off with the new world setting **Compendium Search in Menubar** (`compendiumSearchShowInMenubar`, Manage Content), mirroring how Request a Roll works. The toolbar tool and the keybinding are unaffected by it.
  - **Dragging uses Foundry's native contract and nothing else**: a `text/plain` payload of `{type: <document class>, uuid}`, which is exactly what `TextEditor.getDragEventData` parses and what every core `_onDrop*` handler consumes. So an Item lands on a dnd5e character sheet, an Actor lands on the canvas as a token, and a drop onto a journal builds a link — with no cooperation required from any of those targets and no drop-side code in Blacksmith at all. The drag image is the row's 28px icon rather than the row, because a full-width row ghost covers the sheet you are aiming at.
  - **A Tool window rather than a standard one** (`BlacksmithToolWindowBaseV2`), because the entire use is keeping it open beside a sheet while dragging. It inherits Light/Dark/Glass and the Full/Micro title bar; the CSS draws from `--blacksmith-tool-*` rather than hard-coding color, so it follows whichever theme the user picks.
  - **Not GM-only.** A player dragging gear onto their own sheet is the main case. `game.packs` is already filtered per user, so a player sees only what they have permission on without a separate check.
  - **Results are painted into the container, not re-rendered.** Re-rendering the Application on each keystroke would rebuild the search input and drop focus and caret — fatal for search-as-you-type. A monotonic token discards any in-flight query a newer keystroke has superseded, so a slow result cannot repaint over a fresh one. Rows are built as DOM nodes rather than an HTML string: these are arbitrary document names out of whatever packs a world has installed, and the palette has no business interpreting them as markup.
  - Type switching is the one thing that does re-render, since the subtype list belongs to the type; focus is restored to the search field afterwards. Synthetic types (`Spell`, `Feature`, `Class`, ...) show no subtype selector at all — their subtype is already fixed by the mapping, so a second filter could only contradict it. Types with no compendium mapped are left out of the selector entirely, and a world with no mapping at all gets a pointer to Campaign Settings rather than an empty box.
  - **Defaults to All types.** A palette you reach for mid-session should answer "where is that thing" without first being told what kind of thing it is, so the type selector opens on All and searches every mapped type in one call. The subtype filter is hidden in that mode — pooling subtypes from different document classes into one list would produce a control that means nothing. The row badge falls back from subtype to document class so a JournalEntry or Scene row is still labelled.
  - **Three-character minimum**, against the API's default of two. Searching every mapped type at once opens far more packs per keystroke, and two characters across a full SRD plus third-party content is thousands of hits the limit then discards — expensive work for a list nobody can read. The API default stays 2 for callers scoped to one type.
  - Clicking a row opens that document's sheet, the compendium-sidebar convention. A title-bar action reloads the cached indexes via `clearCache()`. Type and subtype persist per user in the new client-scoped `compendiumSearchPreferences` setting; the query deliberately does not, since a stale search waiting on open is noise.

## [13.14.1]

### Fixed

- **Planning timer never appeared on the encounter bar for players** (`scripts/manager-combatbar.js`): a player saw the turn timer during the planning phase while the GM saw planning correctly. The item's `visible` predicate was `verifyTimerConditions() && state.isActive`, and that second condition is client-local timer state — a player only receives it when the GM's `syncPlanningTimerState` socket message lands. But an item appearing or disappearing is a **structural** change requiring a bar re-render, and the bar re-renders on `combatTimerStateChange`, `planningTimerExpired`, and `endPlanningTimer` only; there is no "planning started" hook. So on a player the sync flipped the flag, the per-tick `blacksmithTimerDisplay` hook wrote into an item that had never been rendered, and nothing made it appear. The GM was unaffected only because their bar re-renders for other reasons around combat start. **That explains both halves of the symptom**: the turn timer's predicate is `!planningVisible() && CombatTimer.shouldDisplay()`, so with planning permanently false on a player the turn timer stopped yielding at turn 0 and took the slot it should have given up. The condition was redundant as well as harmful — `verifyTimerConditions()` already requires turn 0 and not-expired, which is the whole of what it was there to enforce — so it is removed, leaving each timer asking its own module's gate and nothing else, as the turn timer already did. The same check is **kept** in `syncAllTimerReadouts` with a note saying why: that path pushes a value rather than deciding visibility, and `getDisplayState()` reads `state.remaining`, which is 0 before the timer starts, so pushing early would render "Planning Timer Expired" on a timer that has not begun. The rule this leaves behind is that bar visibility must be a function of combat state, which every client agrees on, and never of a timer's internal flags, which arrive asynchronously and only on some clients. **Verify live**: with a player connected, confirm both the GM and the player see the planning bar at turn 0 and the turn timer only after planning ends; that it disappears for both on expiry or when the turn advances; and that disabling the planning timer hides it for everyone.

### Changed

- **Phase 4: correlation and dedupe state moved to the adapter that owns it** (`scripts/stats-sources.js`, `scripts/stats-combat.js`): `stats-sources.js` reached into `CombatStats` for eight members that were never the tracker's — `_attackCache`, `ATTACK_TTL_MS`, `_pendingMidiCrit`, `_midiDedupe`, `_chatDedupe`, `_roundOffenseCache`, `_lastRollWasCritical`, and `_getD20ResultFromRoll`. All eight are now `CombatSources` members and **62 references stop crossing the boundary**. They belong there because their purpose is reconciling the several ways one swing reaches us: a dnd5e roll hook, a midi-qol workflow, and a chat message can all describe the same attack, in any order and sometimes twice. Deciding "these are the same event" is a translation problem, not a statistics problem. Four of the eight the tracker only declared and never used. Two it used once each and now asks for explicitly — `CombatSources.getCachedAttack(key)` when correlating damage to an attack, and `CombatSources.resetRound()` at a round boundary. `_lastRollWasCritical` is the instructive one: the tracker **wrote it and never read it**, which is to say it was pushing state into the adapter through a shared mutable field; that write is now `CombatSources.noteAttackCritical(crit)`, an explicit hand-off in the direction the data actually flows. **The consequence worth keeping is that `stats-combat.js` now imports nothing from `utility-message-resolution.js` or `utility-midi-resolution.js`** — all ten imports were dead once the caches left, two of them having only ever been referenced in JSDoc. The accumulator no longer knows midi-qol exists, which is what the module's standing requirement that midi-qol be optional actually implies; a reappearing import from either utility means event translation has leaked back in, and the file says so where the imports used to be. Not done deliberately: `_ensureParticipantStats` and `_ensureCombatTotals` still hand back live references into the accumulator that the handlers write through. Turning that into an event the adapter returns and the tracker applies is a behaviour change rather than a move, and wants its own verification pass. **Verify live**: a multi-round combat with midi-qol active and one with `enableMidiIntegration` off, confirming in both that a single attack is counted exactly once — the dedupe caches are what prevent double counting, so a correlation break shows as inflated hit counts rather than an error.

## [13.14.0]

### Fixed

- **Turning off Track Combat Stats broke other modules' templates** (`scripts/utility-handlebars.js` new, `scripts/stats-combat.js`, `scripts/api-menubar.js`, `scripts/blacksmith.js`, `documentation/api/api-core.md`): `CombatStats.registerHelpers()` registered nine **global** Handlebars helpers — `round`, `formatDamage`, `formatTime`, `multiply`, `divide`, `add`, `subtract`, `eq`, `gt` — and was called from `initialize()` *after* its `if (!getSettingSafely(MODULE.ID, 'trackCombatStats', false)) return;` guard. So a world with combat statistics switched off had those helpers registered by nothing. **The blast radius was almost entirely outside Blacksmith**: `multiply` and `divide` back Squire's character summary, party panel, and health window, `add` backs its quest handle, and `formatTime` backs Blacksmith's own `timer-combat.hbs` — none of which have anything to do with combat statistics, and none of which would produce an error naming the setting that broke them. `eq` and `gt` happened to survive only because `api-menubar.js` registered its own copies. All twelve shared helpers now live in `utility-handlebars.js` and are registered as the first statement of `init`, unconditionally and before anything renders; the registrations in `stats-combat.js` and `api-menubar.js` are gone, with a note at each site saying where they went and why. **These are a cross-module contract, not an internal convenience** — Squire, Bibliosoph, Curator, Monarch, and Regent all render against them — so they are now documented in `api-core.md` as published surface. `formatTime` is registered as a direct function reference rather than wrapped, deliberately: it reads `this.planningDuration` and `this.turnDuration` to choose between a duration, `SKIPPED`, and `EXPIRED`, and Handlebars binds `this` to the template's data context, so wrapping it would silently turn every skipped or expired timer into a number. Feature-local helpers stay with their features — VoteManager's and XpManager's are each used by one template owned by the same subsystem, and both already registered unconditionally. **Verify live**: turn Track Combat Stats off, reload, and confirm Squire's character summary and party panel still show their numbers and the combat timer still renders its countdown; turn it back on and confirm the stats cards are unaffected.

### Changed

- **Stats tracker decomposed: `stats-combat.js` 5,264 lines to 2,849** (`scripts/stats-cards.js` new, `scripts/stats-mvp.js` new, `scripts/stats-sources.js` new, `scripts/stats-combat.js`, `documentation/architecture/architecture-stats.md`, `documentation/plans/plan-stats-decomposition.md`, `documentation/TODO.md`): one class of 94 static methods doing at least seven jobs is now four files split by direction of dependency rather than by subject. `stats-sources.js` (1,034 lines) translates events in — the dnd5e roll hooks, midi-qol workflows, chat messages, crit/fumble detection, and the socket that carries a player's rolls to the GM. `stats-cards.js` (872) renders results out; it backs all eleven card templates in both families. `stats-mvp.js` (634) holds MVP scoring and the narrative written from it. `stats-combat.js` keeps the accumulator, the rules, persistence, and the public read surface. **The public API did not move** — `stats.player`, `stats.party`, and `stats.combat` are unchanged, which is what made the work possible: the 90+ harness assertions over those surfaces assert invariants between code paths, and the failure mode of moving code is two paths quietly disagreeing. Three phases, one commit each, on `refactor/stats-decomposition`. **The four files do not reference each other uniformly, and the differences are load-bearing.** Cards are imported lazily because they are needed only when a card is sent, so laziness costs nothing and removes a cycle. The integration handlers are imported statically *as* a cycle, because they are needed while `_registerHooks` runs and `initialize()` calls that synchronously — `socket.register` needs the class right then, and a lazy import would have pushed an `await` into the bootstrap sequence that `architecture-blacksmith.md` §3 warns about. That cycle is the harmless kind only so long as no static field initializer crosses it, which is stated as a condition at the top of `stats-sources.js` rather than left to be rediscovered. `stats-mvp.js` imports nothing back and needs neither treatment. **`_registerHooks` was deliberately not split**, against the plan: keeping it whole with its callbacks repointed was both lower risk and the better arrangement, leaving one place where every hook and socket is registered. **Two dead methods were deleted rather than carried into new files** — `generateRoundSummary`, which rendered a template and had no caller anywhere, and `_generateMVPDescription`, a definition with no caller. **Two defects reached the working tree before verification caught them, and both were missing lowercase imports** — `assetLookup` in `stats-mvp.js`, which threw inside `_calculateMVP` on every round end and took the round cards with it, and `getActorPortrait` in `stats-cards.js`, latent and untriggered. `node --check` cannot see either, and neither could an unresolved-identifier scan that only matched capitalised names, since module helpers and imported functions are overwhelmingly lowercase. The check that catches this class — and the one to run first next time — is to take every module-scope name the original file had, imports and top-level declarations both, and confirm each one referenced in a new file is imported or declared there. **Verified live**: harness Stats suite 60/60 idle, then `running-shape` 23/23 and `running-mirror` 9/9 with a combat running; a multi-round combat with midi-qol recording hits, damage and crits across three attackers including an NPC; MVP scoring and description generation completing; every card in both families posting with data; and a second pass with a player connected, exercising `_forwardToGM` and the `_onSocket*` receivers — the distributed path, and the one a GM-only test cannot reach, since a player's rolls happen on their client and only reach the accumulator over the socket.

## [13.13.2]

### Added

- **`stats.combat.getRunningStats()` now works on a player client** (`scripts/stats-combat.js`, `scripts/manager-combatbar.js`, `utilities/tests/suite-stats.js`, `documentation/architecture/architecture-stats.md`, `documentation/api/api-stats.md`): it returned null for everyone but the GM, which made live combat statistics GM-only and defeated the point of having them — the audience for "biggest hit of the fight" is the player who landed it. The cause was conflating two different things: tracking is GM-gated so that there is **one writer** and no conflicting updates, and the getter had taken that to mean the data is GM-only. It is not. `_schedulePersistCombatStats` already mirrors the accumulator to a `combatStats` combat flag on a one-second debounce, and a combat document syncs to every client, so the numbers were on every machine at the table already — merely unreadable, because the getter looked only at the in-memory copy a player never fills. That mirror exists for reload resilience, restoring a GM who refreshes mid-combat, and doubles as a broadcast channel at no cost. **No socket was added and none is wanted**: a flag write already fires `updateCombat` on every client, which is what makes a readout follow along without subscribing to anything. `getRunningCombatSource()` now reads that flag for **every client, the GM included** — deliberately, even though the GM has memory sitting right there and fresher. Two read paths would mean the GM's screen works when the players' does not, so a broken mirror would show the whole table placeholder readouts while the one person able to diagnose it saw perfect numbers and no error anywhere; no amount of logging fixes a failure the maintainer cannot see, and deleting the second path does. The cost is that the GM's figures trail by up to the debounce interval, which for a readout is nothing, and that the first moments of a combat show placeholders for everyone until the first mirror lands — the latter is an honest report rather than a degradation, since nothing has been broadcast yet. `_buildCombatAggregate(source)` takes its input instead of reaching for `combatStats`, which is what lets `_generateCombatSummary` keep reducing memory directly: a stored summary must be exact rather than current-to-within-a-second. **A serialization bug surfaced with it**: `fastestTurn`'s "nothing timed yet" sentinel is `{duration: Infinity}`, JSON has no `Infinity`, and the flag round-trip turns it into `{duration: null}` — so the `!== Infinity` test passed the sentinel straight through on the flag path and returned an object where the memory path returned null. It now asks whether the duration is finite rather than comparing against one spelling of unusable, which is the general rule for anything crossing that boundary (`_serializeForCombatFlag` already normalizes `Map`s for the same reason). The harness gained a matching check and a live-state row: the check compares the mirror against the GM's in-memory accumulator, since comparing it against the getter would now be comparing a value to itself, and the row reports the mirror as MISSING in red when it has not been written. **Verify live**: with a player connected, start a combat and land a few attacks, then confirm the player's encounter bar and the GM's show the same damage, hit rate, and biggest hit, both updating within a second or so of each attack; and run the harness Stats tab with a combat in progress, confirming the mirror row reports participants rather than MISSING.

- **Encounter bar: party statistics in the middle zone** (`scripts/manager-combatbar.js`, `scripts/api-menubar.js`, `documentation/architecture/architecture-encounter.md`, `documentation/api/api-menubar.md`): the middle zone had been held empty for this since the encounter bar merge. Six `info` items now live there, three visible at a time, swapped by combat state through `visible` predicates — out of combat the standings (biggest hit on record, most fumbles, top MVP), in combat the fight in progress (party damage dealt, hit rate, biggest hit so far). **The bar reduces nothing**: it reads `stats.party.getAggregateSync()` and `stats.combat.getRunningStats()`, both single reductions shared with the Party Statistics window and the end-of-combat card, so a figure on the bar cannot disagree with the card a moment later. **Everyone sees both sets**, which required making the running statistics readable by players — see the entry below. The standings read is synchronous because the cache is warm except at cold start, and the async fallback writes when it lands, which keeps the refresh synchronous for a caller inside the render path; the bar also refreshes on `blacksmith.combatSummaryReady`, the same hook `stats.party` invalidates on, because the moment a fight ends is exactly when the previous combat's standings would otherwise still be showing. Names are shortened to their first word, so "Favia Gita" reads as "Favia" — the middle zone is `flex: 1 1 0` and a long name shoves the readouts either side of it around — with the full detail in the tooltip. The overflow suppression order now puts the statistics ahead of health and the timers, since nothing in the moment depends on them, and within each set the least operational goes first so the biggest hit on record and the damage total are what survive longest. **`updateSecondaryBarItemInfo` now accepts `tooltip` for info items**, which it had silently dropped: the update was accepted, the field discarded, and a tooltip could only ever be set at registration — which makes a chip showing a bare number unable to say what the number is, exactly the case here where the tooltip names who hit whom for how much. This is phase 3 of `documentation/plans/plan-encounter-bar-stats.md`; which numbers ultimately earn the space is phase 4 and a table decision. **Verify live**: out of combat as GM, confirm three chips in the middle of the data row showing a name and figure for biggest hit, fumbles, and MVP, and that they match the Party Statistics window; start a combat and confirm they are replaced by damage, hit rate, and biggest hit, all of which move as attacks land; end the combat and confirm the standings return with the just-finished fight included; narrow the Foundry window and confirm the statistics disappear before the health bars and timers do; and confirm as a player that the standings are visible out of combat and that no statistics appear during one.

- **Test harness: a stats suite, and interactive checks can now assert** (`utilities/tests/suite-stats.js` new, `utilities/test-harness.js`, `utilities/tests/harness-lib.js`): seven headless checks and three interactive ones over `stats.player`, `stats.party`, and `stats.combat`. Sample values cannot be asserted — a world's stats are whatever that table has played — so the suite asserts **invariants between code paths** instead, which is where the real risk is: totals must equal the party subset of participants reduced (the party-only policy a second reducer would quietly break), MVP rankings must contain no non-party actors and must be sorted descending, `totalAttacks` must equal hits plus misses, the running combat must carry no `sceneName` or `rounds` array (their appearance would mean the live getter has drifted toward being a summary), `getAggregateSync()` must be warm after `getAggregate()` resolves, a `refresh()` must land on the same figures since nothing changed between the two reads, and `getCombatHistory`'s limit must be a read-time cap that does not reduce what is stored. Checks needing a live combat skip cleanly with a logged reason rather than failing, since the harness runs against whatever world is open. **The two headline checks are interactive because they need a person to choose the moment, not to judge the result**: capture the running combat mid-fight, end the combat, then compare the capture against the stored summary — the automated form of the manual "do these two agree" step, and the thing that would catch the shared reduction being split again. Fields may only move up between the two readings, since the fight continued; a summary reporting *less* than was already observed means the paths have diverged. That required a harness change: interactive checks received only `{api, log, game}` and so had no way to assert. They now get a recorder as well, and any assertions they record are reported exactly as a headless check's are while a check that records none just logs as before — additive, with no existing suite affected. They stay out of "Run All Headless" either way, since a person has to drive them. **A check may also now carry an optional `group`**, which renders a sub-heading inside its tier — ten checks in one flat list is a wall, and the four the Stats tab divides into (Surface, Running combat, Party aggregate, History) say what each run of buttons is for. Grouping is by **adjacency** rather than by bucketing every check sharing a name: bucketing would silently reorder, and a suite whose checks read as a sequence — capture this combat, then compare after it ends — would come apart. A check without a `group` renders with no heading, so every suite written before this is untouched. `harness-lib.js`'s documented context is also corrected: it claimed `subject` where the harness has always passed `game`. **Verify**: run the harness as GM and confirm the Stats tab's headless checks pass with no combat running (several reporting a skip), then start a combat, land some attacks, and re-run to exercise the policy and shape checks.

## [13.13.1]

### Fixed

- **Secondary bar image items rendered at the source image's intrinsic size** (`styles/menubar.css`, `documentation/architecture/architecture-menubar.md`): reported by Herald against 13.13.0, where the broadcast bar's portrait buttons blew out to the width of the screen and the bar clipped a horizontal band out of the middle of each face. `--secondary-bar-item-image-size` was `100%`, which is not a size in this context: a `.secondary-bar-item` is a shrink-to-fit flex box with `min-height` and `min-width` but no `width` or `height`, so a percentage dimension on a child is cyclic, and CSS breaks the cycle by resolving the parent against the child's **intrinsic** size. `100%` therefore meant "the portrait's natural dimensions", and Foundry actor art is routinely 512px. `object-fit: cover` does not help — it governs how an image fills a box whose size is already decided — and `min-width` is a floor rather than a ceiling. The value is now `calc(var(--blacksmith-menubar-secondary-height) - 12px)`, the same number as the item's own minimums, so an image item is exactly the minimum square and gives an 18 / 33 / 48px progression across the three presets; the `- 12px` lands correctly because `.secondary-bar-item:has(.secondary-bar-item-image)` already zeroes the item's padding, leaving two pixels of border over the image and two pixels of slack inside the toolbar at every preset. **The regression came from removing the subtractive-banner rules in 13.13.0**, which included the only rule anywhere that gave the image a concrete length; `100%` had never been load-bearing, since bannered items always overrode it and no unbannered bar in the suite has ever used an image item, so the line had never been exercised. Icons are unaffected: an `<i>` has no intrinsic size to fall back to, which is why every icon-and-label bar in the suite verified clean. That is also the lesson worth keeping — a bar can be exactly the right height with its contents entirely wrong, so a layout check must look at an item and not only at the bar. **Verify live**: open a bar with image items at each of the three presets and confirm the images are square, no wider than the bar is tall, and show whole faces rather than a cropped band; confirm icon-and-label bars are unchanged.

### Added

- **`stats.combat.getRunningStats()`: the combat in progress** (`scripts/stats-combat.js`, `scripts/api-stats.js`, `documentation/api/api-stats.md`, `documentation/architecture/architecture-stats.md`): the whole-combat accumulator had no public accessor, so "damage this fight" was unanswerable from outside while the fight was happening — `getCurrentStats()` returns the *round*, and `getCombatSummary()` the last combat that *finished*. It now returns `{combatId, round, duration, durationSeconds, totals, participants, notableMoments}`, or null when nothing is being tracked. **The shape was not designed separately, and that is the substance of the change.** `_generateCombatSummary` already reduced `combatStats` into exactly those fields before wrapping them in scene and duration metadata, so the reduction is extracted as `_buildCombatAggregate()` — pure over `combatStats`, no metadata, no writes — and the summary generator and the live getter both call it. Writing a second reducer would have been a second definition of who counts as the party, how misses are inferred when only attempts and hits were recorded, and how MVP is scored; the two would then have disagreed at the moment combat ends, which is the one moment a table is looking at both numbers. The policy split is preserved because it is the same code: `totals` is party-only, `participants` includes NPCs for context. `_generateCombatSummary` keeps the one write that is genuinely its own, stamping `mvpRankings` back onto `combatStats` for the stored summary. Unlike `stats.party`, this is **derived on call rather than cached** — it changes on essentially every combat event, so a cache would need invalidating more often than it would be read; callers rendering per tick should read it on their own update rather than polling. The three tier names sit close together and are easy to misread, so the API doc now carries a table distinguishing round, running combat, and finished combat. This is phase 2 of `documentation/plans/plan-encounter-bar-stats.md`. **Verify live**: with a combat running, call `game.modules.get('coffee-pub-blacksmith').api.stats.combat.getRunningStats()` after a few attacks and confirm `totals.hits`, `totals.damageDealt`, and `notableMoments.biggestHit` reflect what has happened; confirm `notableMoments.mvpRankings` is populated and ordered; end the combat and confirm the summary card reports the same figures the last live read did; and confirm the call returns null with no combat running.

## [13.13.0]

### Added

- **`stats.party`: party-wide aggregates behind the stats API** (`scripts/stats-party.js` new, `scripts/api-stats.js`, `scripts/window-stats-party.js`, `scripts/blacksmith.js`, `documentation/api/api-stats.md`, `documentation/architecture/architecture-stats.md`): every other tier of the stats API answers per actor or per combat, so anything party-wide has to be reduced across the party — and that reduction lived in `window-stats-party.js`, which looped every player-owned actor, awaited `getStats` for each, and built the headline tiles and leaderboard by hand. Fine for a window opened occasionally; unusable for a second consumer, which would have needed its own copy of the party definition, the tie-break rules, and the field choices. The reduction now lives in one place behind `stats.party`, exposing `getAggregate`, `getAggregateSync`, `getPartyActors`, and `refresh`; the window consumes it and its `_buildSummary` and `_buildLeaderboard` are gone, 211 lines out for 5 in. **The aggregate is cached, not derived per read** — building it awaits `getStats` for every party actor and reduces the whole combat history, which a menubar readout re-rendering on every combat update cannot pay for. It rebuilds on `blacksmith.combatSummaryReady` and on actor create, update, and delete, and never on read. `getAggregateSync()` exists for callers that render synchronously: it returns the cache when warm and null while a rebuild runs, so a render draws what it has and picks the rest up next time rather than blocking or being forced async. `stats-party.js` reads the lifetime flags and the stored history and writes neither, so it owns no data of its own. This is phase 1 of `documentation/plans/plan-encounter-bar-stats.md`; the readouts that consume it come later. **Verify live**: open Party Statistics and confirm it renders exactly as before — same tiles, same leaderboard order, same totals — since only the location of the computation changed; then finish a combat and confirm the figures move on the next open.

- **Combat bar: party-versus-monster balance bar, and challenge rating becomes design-time only (encounter bar merge, phases 5 and 7)** (`scripts/manager-combatbar.js`, `documentation/architecture/architecture-encounter.md`): a `balancebar` item reading `partyPercent - monsterPercent`, so zero means both sides are equally worn and +100 means the monsters are down with the party untouched. Percentages rather than raw HP, so a big-pool boss and a swarm read on the same scale. The shared marker maths is `50 + (p / 2)`, which places negative left and positive right — hence left is the monsters' side, coloured to match the monster health bar, and right the party's. **It is visible to everyone**, unlike monster health: it reports a relationship rather than a quantity, so the table gets the boss-bar read without learning what any monster actually has left. It carries no labels — it is a measure of balance, not a second place to read the health numbers the two health bars already show. The party is `fa-helmet-battle` throughout, matching the challenge rating, and icons in the data row now run a step smaller than the text, since at the same size they compete with the value they label and stop reading as adornment beside an 18px bar. The timer slot moved to the left zone beside round and turn, where its group divider gives it the same pipe separation the right zone's groups have, and its text is left-aligned with the rest of that zone rather than centred over its bar. Labels inside a bar now share one size variable across health, timer, and balance — the shared rules style each kind separately and each sets its own `font-size`, so they had no reason to stay in step — and that size is a step below the chip text, since it sits on a coloured fill rather than on the row. Combat row button order is now Encounter, Tokens, Initiatives, and the graveyard moved to sit beside the portrait strip ahead of the turn navigation, since it holds portraits the strip is hiding rather than being a control. **Challenge rating now scopes with combat rather than hiding** (`scripts/manager-encounter.js`): out of combat it rates the fight as designed, counting everything on the canvas; in combat it rates the party against what is actually in the encounter, so a fight can be scaled while it runs by adding or removing combatants and watching the number move. That is the same rule health already followed and for the same reason. `getPartyCR`, `getMonsterCR`, and `getCombatAssessment` each gained an optional token-or-combatant list, defaulting to the canvas, so the encounter bar and the journal toolbars are unaffected. **Verify live**: out of combat, confirm both challenge rating values and the difficulty chip are present; start a combat and confirm the two values disappear while difficulty remains and the balance bar keeps its place; damage the party and confirm the marker slides toward the monsters' side, then damage the monsters and confirm it slides back; and confirm as a player that the balance bar is visible while monster health and challenge rating are not.

- **Combat bar: planning and turn timers (encounter bar merge, phase 7)** (`scripts/manager-combatbar.js`, `scripts/timer-planning.js`, `scripts/timer-combat.js`, `styles/menubar-combatbar.css`, `styles/timer-planning.css`, `styles/timer-combat.css`): the two countdown timers now draw on the combat bar's data row as well as in the tracker. They share one slot rather than each holding space, expressed as two `progressbar` items whose `visible` predicates are mutually exclusive — the planning timer hands off to the turn timer when it expires, so the two are never live at once and nothing has to switch identity. The round and total elapsed timers are deliberately excluded: they count up with no maximum, so they have no percentage to fill and want to be text chips rather than bars. Visibility is shared too, and neither item is keyed on a state flag. The turn timer uses a new `CombatTimer.shouldDisplay()` extracted from the tracker's render guard — combat started, round not zero, timer enabled, not GM-only-hidden, and every combatant's initiative rolled — deliberately *not* `CombatTimer.state.isActive`, which reads like "the timer is running" but is assigned only in `resumeTimer` and so is false for a timer that started normally. The planning timer uses its existing `verifyTimerConditions()`, which is the same gate its tracker render sits behind: enabled, combat started, **turn 0**, not expired, GM-only respected, turns built, every initiative rolled. `isActive` alone does not express any of that and in particular stays true past turn 0, which is what put planning on the bar mid-round. The rule in both cases is that the timer module already owns its display conditions and the bar asks it, rather than reconstructing them. **The display logic is shared rather than copied.** `PlanningTimer.getDisplayState()` and `CombatTimer.getDisplayState()` now return `{percent, state, text, isExpired}` and are the single source of truth for every surface that draws the timer; each timer previously computed the same 25/50 percent thresholds and the same paused/expired text precedence in two or three separate places, which the extraction collapses to one apiece — a third copy on the bar would have drifted silently. The band colours moved into custom properties declared beside the tracker's own bar styles, and the bar's fill takes a state class instead of an inline colour, so both surfaces resolve the same values. The two timers' text precedence genuinely differs — paused wins over expired for the turn timer, expired wins for planning — and that is preserved rather than normalised, being existing behaviour rather than a bug. **Per-tick updates write DOM directly and do not re-render.** Timers tick once a second, and routing that through `updateSecondaryBarItemInfo` plus a menubar rebuild would rebuild the bar every second for the duration of every combat, which is precisely the cost the menubar fingerprint exists to avoid and the reason the tracker's own timers write into a cached DOM node set. The timers fire a `blacksmithTimerDisplay` hook and the bar writes straight into the rendered fill and label; only transitions — pause, resume, expiry, handoff — trigger a rebuild, because those change which item is visible and that is structural. A hook rather than a direct call keeps the bar out of the timers' import graph, since `manager-combatbar` already imports both timer modules to read their state and a call back would close a cycle. Items are registered with non-empty labels because the shared partial renders label spans behind `{{#if}}` and a span that never rendered cannot be written to. Two consequences of the fill being drawn by CSS rather than inline: the per-tick write clears the inline `background-color` the partial emits, since an inline declaration beats the stylesheet and would otherwise keep the fill permanently transparent; and a fresh render pushes both timers' current state immediately, because the bar is only written on ticks and would otherwise show an empty track for up to a second after appearing. That first write also lands with the transition suppressed: a re-rendered item is built from the registered `percentProgress` of 0, so the jump from 0 to the real value would otherwise be animated by the 1s transition into a full second of the bar sweeping up to where it already should be. The tracker never shows this because its markup persists between renders, whereas the bar's is rebuilt by the menubar on every combat update. **Verify live**: start a combat with both timers enabled and confirm the planning bar appears on the data row counting down in blue, that it disappears and the turn timer replaces it in green when planning expires, and that the turn bar passes through yellow and red at the same points the tracker's does; pause each and confirm both the tracker and the bar read "PAUSED" together; confirm the tracker's own timers still behave exactly as before, including the low-time pulse on planning; and confirm that with a timer disabled in settings its bar is absent rather than empty.

- **Combat bar: party and monster health (encounter bar merge, phase 6)** (`scripts/manager-combatbar.js`): two `progressbar` items in a `health` group on the data row — party HP visible to everyone, monster HP GM-only on the same reasoning as the challenge rating. Scoping follows what the bar is being asked: out of combat it reads the canvas, matching how the challenge rating is computed, and in combat it reads the tracker, because "how is this fight going" is a question about the combatants rather than the scene. The totals come from `getActorHP` in `utility-health.js` rather than a fourth private copy of the HP-shape lookup; `TODO.md` carries an item to move the combat bar and party bar onto that helper, and this is its first consumer. **Linked tokens are counted once per actor.** Five goblins stamped from an unlinked prototype are five separate HP pools, but two tokens of the same linked PC are one pool, and summing per token would double that character's contribution — while deduping everything by actor id would collapse the goblins, since unlinked synthetic actors share the prototype's id. The dedupe therefore keys on actor id and applies only to linked tokens. Refresh rides the existing debounced readout path from `updateActor` and `updateToken` rather than the combat bar's HP handlers, which only fire for combatants and so would leave the canvas-scoped totals stale between encounters. **Verify live**: out of combat, damage a party token and a monster token on the canvas and confirm both bars move within a moment; place a second token of a linked PC and confirm the party maximum does not double, then place five unlinked goblins and confirm the monster maximum counts all five; start a combat containing only some of those tokens and confirm both bars switch to the tracker's membership; and confirm as a player that the party bar is present and the monster bar is not.

- **Combat bar: readouts as registered items, with challenge rating (encounter bar merge, phase 4)** (`scripts/api-menubar.js`, `scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menubar-combatbar.css`): a bar type may now declare `hybridItems: true`, which makes `_prepareSecondaryBarData` fall through to the zone preparation instead of returning early for a custom template. Custom markup and registered items had been mutually exclusive, which left the combat bar unable to use the `info`, `progressbar`, and `balancebar` kinds even though those are exactly what its readouts need — a challenge rating chip, a health bar, a party-versus-monster balance, a timer. Because `menubar.hbs` invokes a custom partial with `secondaryBar.data` as its context, the prepared zones and banner settings are copied onto `data.data`; the combat template then hands its own context straight to the `menubar-secondary-default` partial and reuses the whole item rendering rather than restating it. The bar is now **two rows with different jobs**: a fixed-height data row on top holding readouts only, and below it the existing combat row, which keeps scaling with the size setting because portraits need it and keeps every control at the size it already was. The split is not cosmetic. Item sizing is pinned to bar height — group banners at 20% of it, item minimums at bar height minus chrome applied to *width* as well as height, progressbar height at 40% — so items placed in a portrait-scaled row inflate into large squares, and the health and balance bars planned next would render as slabs. A fixed row gives them a constant basis. The mechanism is mostly one line: the data row redeclares `--blacksmith-menubar-secondary-height` as its own height, and because custom properties inherit, the group banner height, the item minimums, and the JS-set inline `calc()` for progressbar height all re-base without the shared partial or the item JS knowing rows exist. It is *mostly* one line because the font, icon, padding, and gap variables are declared at `:root` and substitute at computed-value time there, so they resolve against the root height and inherit down already resolved — those five have to be redeclared in the row to be recomputed. Round and turn moved into the data row as `info` items, which retires both endcaps: the combatant-name one because the highlighted portrait already says whose turn it is, and the round one because a readout belongs with the readouts. **Party CR, Monster CR, and Difficulty ship registered**, GM-gated since encounter difficulty is not player information, refreshed by the bar's own debounced `createToken` / `updateToken` / `deleteToken` hooks rather than `EncounterToolbar`'s — those are registered only when `enableJournalEncounterToolbarRealTimeUpdates` is on, and a readout on a permanently visible bar must not go stale because a setting named after journal toolbars was switched off. Group banners are off: a banner captions a cluster of unlabelled buttons, which is what the Broadcast and Cartographer bars need, whereas each of these items carries its own label and would only have the word repeated above it. Groups remain, as divider boundaries. Readouts in the data row also drop the shared item chrome — fill, border, radius, pointer cursor, hover lift, and the square minimum width — since that styling exists because on a default bar every item is a button, and applied to a value it boxes something that cannot be clicked and offers an affordance that does nothing. `hybridItems` is a public config option, so `documentation/api/api-menubar.md` now documents it and no longer claims default and custom rendering are mutually exclusive. The data row is present for players too, who see round and turn without the challenge rating. **Verify live**: as GM out of combat, confirm a compact readout row above the controls showing challenge rating, that its text is small and fixed rather than scaling, and that adding or removing canvas tokens updates the values within a moment; start a combat and confirm round and turn appear in that row while the portraits appear below, with the readouts neither moving nor resizing; change the combat size setting and confirm only the lower row and its portraits scale; and confirm as a player that the row is present with round and turn but no challenge rating.

- **Combat bar: separate in-combat and out-of-combat sizes (encounter bar merge, phase 3)** (`scripts/manager-combatbar.js`, `scripts/settings.js`, `lang/en.json`): a second size setting, `menubarCombatSizeIdle` (default 40), sits beside `menubarCombatSize` (default 60, relabelled "Size In Combat"). The bar carries portraits during an encounter and only its menus between them, so one height cannot suit both — a bar tall enough for portraits wastes a strip of screen for the rest of the session, and the menubar's height offsets everything Foundry draws beneath it. Both settings are read in exactly one place, `resolveBarHeight(isInCombat)`, and written in exactly one place, `applyBarHeight`, which `updateCombatBar` calls on every render; since every combat-state transition already routes through `updateCombatBar`, the bar resizes on each one without any transition needing to know about heights. Two details are load-bearing. The height is applied **before** the bar data is built, because portrait ring geometry is computed inside `getCombatData` by reading the height variable through `getComputedStyle` — applying it afterwards sizes the rings from the previous state, and the open path had exactly that ordering until this change. And the two variables do different jobs: `--blacksmith-menubar-secondary-height` drives the layout (portrait sizes, button sizes, font sizes, and `--blacksmith-menubar-total-height`, which offsets the UI below the menubar), while `--blacksmith-menubar-secondary-combat-height` is read only by the ring math. The size setting-change handler now covers both keys and delegates to `updateCombatBar` rather than writing variables itself, so editing whichever size is not currently in force correctly leaves the bar alone. **Verify live**: out of combat, change the out-of-combat size and confirm the bar and the canvas below it resize immediately while the in-combat size does nothing; start a combat and confirm the bar grows to the in-combat size with portraits and rings drawn at that size, and that now the in-combat slider is the live one; end combat and confirm it shrinks back; and confirm at both sizes that the canvas and sidebar sit flush against the menubar with no gap or overlap.

- **Combat bar: encounter and token actions (encounter bar merge, phase 1)** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`): the encounter secondary bar's tools are now also reachable from the combat bar. The Encounter menu gained **Create Combat / Add to Combat** and **Quick Encounter**; a new **Tokens** button carries **Reveal Hidden**, **Remove Party from Canvas**, **Remove Monsters from Canvas**, and **Remove NPCs from Canvas**. Every one calls the same handler the encounter bar's item calls, so behavior is shared rather than reimplemented. This exists because the two bars are tenants of one slot — `MenuBar.secondaryBar` holds a single `type` and `openSecondaryBar` closes whatever was open first — and the eviction is self-inflicted: `createCombat` auto-opens the combat bar, so pressing the encounter bar's own primary button is the most common way to lose it, which is why the workflow had been a constant toggle between the two. Create Combat and Add to Combat are one row with two labels, not two code paths: `MenuBar.createCombat` already creates an encounter when there is none and otherwise folds the selected-or-all canvas tokens into the running one, skipping those already in the tracker. The Encounter menu no longer refuses to open without an active combat — rows that need one (Clear Movement Histories, scene link, Delete Encounter) drop out instead, leaving the rows that apply. The token actions load `manager-encounter.js` and `utility-party.js` on demand rather than importing them, keeping the encounter graph off the combat bar's load path. **The encounter bar is untouched and still registered**, so the two overlap for now; this is phase 1 of the encounter bar merge and is knowingly half a feature. The combat bar still only appears when a combat exists, so Create Combat is mostly reachable in its Add to Combat form, and the canvas-clearing actions show during combat, which is the state the plan eventually wants them hidden in — hiding them now would make them unreachable, since there is no out-of-combat bar yet to show them on. Both resolve in phase 2. **Verify live**: during combat, confirm the Encounter menu reads "Add to Combat" and that using it with tokens selected adds exactly those, and with nothing selected adds every canvas token not already in the tracker, in both cases without duplicating anyone; confirm Quick Encounter appears only when that tool is available and opens the same window the encounter bar opens; confirm each of the four Tokens actions does what the matching encounter bar button does; and confirm the encounter bar itself still works unchanged.

- **Combat bar: Graveyard button** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menu-context-global.css`): a button at the right end of the bar listing the dead that the "hide dead" setting (`menubarCombatHideDead`) has taken off the strip. Until now that setting simply dropped them from `getCombatData`, which also dropped every action attached to them — a hidden combatant could not be panned to, un-defeated, or removed from the encounter without turning the setting back off or opening the tracker. The dead are now partitioned out of the rendered list instead of discarded, and the button appears only when that partition is non-empty, so with the setting off there is no button and the dead stay in the strip as before. Each row carries the combatant's portrait as a thumbnail and opens that combatant's own context menu on click — the same menu its portrait would give on right-click, Pan to Token included — rather than duplicating a subset of those actions. Rows are built from `combat.turns` and respect the same hidden-combatant filter the strip uses, so a player never sees a combatant in the Graveyard that they could not see on the bar. The dead test itself moved into `CombatBarManager.isCombatantDead` (PCs dead only when marked defeated, NPCs at zero HP) and is now shared by the strip and the Graveyard; had the two kept separate copies, any drift between them would make a combatant disappear from both at once. The button also carries the count in its tooltip, and uses `fa-skull` — the same icon the strip already puts on a defeated portrait — rather than a headstone or cross, so the bar carries no religious iconography. **Verify live**: with "hide dead" off, confirm no Graveyard button appears and dead combatants remain in the strip; turn it on and confirm they leave the strip and the button appears with the right count; open it and confirm each row shows a portrait and name, and that clicking one opens the full combatant menu; use Toggle Defeated from that menu and confirm the combatant returns to the strip and the button's count drops, disappearing entirely at zero; and as a player confirm a hidden dead NPC is not listed.

- **Combat bar: Initiatives and Encounter buttons** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menubar-combatbar.css`): two GM-only dropdowns on the bar, so the encounter-level actions that previously required opening the combat tracker are reachable from the bar itself. **Initiatives** holds Roll All (`combat.rollAll()`), Roll Remaining (Blacksmith's own `CombatTracker._rollRemainingInitiatives()`, the same routine behind the button it injects into the tracker), Roll Party, Roll NPCs (`combat.rollNPC()`), and Reset Initiative (`combat.resetAll()`). Roll Party has no core counterpart — core provides `rollNPC` and nothing for the other side — so it builds its id list the same way `rollNPC` does and inverts the test, taking owned combatants where `!isNPC && initiative === null`. **Encounter** holds Show/Hide Combat Tracker, Clear Movement Histories (`combat.clearMovementHistories()`), Link/Unlink from Scene (`combat.toggleSceneLink()`), and Delete Encounter. Every one calls the same core method the tracker's own menu calls, so behavior matches rather than merely resembles — including Delete Encounter going through `combat.endCombat()` and not `combat.delete()`, because `endCombat` is the path that carries core's confirmation prompt. The scene-link row reads "Link to Scene" when `combat.scene` is null and "Unlink from Scene" when it is set, since a fixed label lies about what the row will do in one of the two states. Rows disable themselves the way core's conditions do: the roll actions when nothing is left unrolled, Reset when `combat.turns` is empty, Clear Movement Histories when the encounter has no combatants. The buttons take the leftmost slot on the bar and are gated on `isGM` **but not on `isActive`** — rolling initiative is what you do before combat starts, so hiding them until it does would hide them exactly when they are wanted. Both menus render in `UIContextMenu`'s tinted `gm` zone, anchored under the button rather than at the pointer, and are closed explicitly during bar teardown since they live on `document.body` and would otherwise outlive it. **Verify live**: as GM with an encounter that has unrolled combatants, confirm both buttons appear before combat is started; that Roll All, Roll Remaining, and Roll NPCs each fill in initiative and then grey out with nothing left to roll; that Reset Initiative empties every value; that Clear Movement Histories runs without error after moving a token; that the scene-link row's label flips each time it is used; that Delete Encounter prompts before deleting; and that as a player neither button is present.

- **Combat bar portrait menu: Update Participant, Initiative, and Toggle Defeated** (`scripts/manager-combatbar.js`): four actions the combat tracker's own context menu had and the bar did not, which is the gap that sent the GM back to the tracker mid-turn. **Update Participant** (in the Character submenu) opens Foundry's `CombatantConfig` for the combatant — the same sheet the tracker opens, reached through `combatant.sheet` so any system or module sheet registration is respected, with a direct `foundry.applications.sheets.CombatantConfig` construction as a fallback. **Initiative** is a submenu holding **Clear Initiative** (`initiative: null`, disabled when there is nothing to clear) and **Reroll Initiative** (`combat.rollInitiative([id], { updateTurn: false })` — a reroll reorders the list, and dragging the active turn along with it is not what rerolling one combatant means). **Toggle Defeated** sets or clears the state and mirrors the core tracker by writing both halves of it: the combatant's `defeated` flag *and* the actor's `CONFIG.specialStatusEffects.DEFEATED` status effect as an overlay. Writing only the flag is the half-state that leaves a corpse without its skull overlay on canvas, which is the half players actually see. **Verify live**: as GM, right-click a portrait and confirm Update Participant opens the same window as the tracker's, that edits made there appear in the bar; that Clear Initiative empties the value and greys itself out afterwards while the portrait moves to the end of the bar; that Reroll Initiative produces a new value without changing whose turn it is; and that Toggle Defeated both dims the portrait and puts the overlay on the token, then reverses both when used again.

### Changed

- **Secondary bar sizing: a house default that works, size presets, and group banners that stop stealing height** (`styles/menubar.css`, `scripts/api-menubar.js`, `scripts/blacksmith.js`, `scripts/manager-combatbar.js`, `documentation/api/api-menubar.md`, `documentation/architecture/architecture-menubar.md` new, `tools/wiki-sync.mjs`): every module in the suite drew its secondary bar at a different height, and each had arrived at its own number honestly. Three separate faults compounded. `--blacksmith-menubar-secondary-default-height` was declared `0px` — falsy, so both readers fell straight through to a hardcoded fallback and the variable had never once been used, while `registerSecondaryBarType` defaulted to an unrelated `50` that matched neither the fallback nor the 30px primary menubar. And **group banners were subtractive**: a bannered group derived an `--available-height` of bar height minus banner minus gap minus chrome and sized its items from that, which at 30px leaves buttons 6px tall. That is the fault that did the real damage, because bar height is a **master scale factor** rather than a dimension — every font, icon, image, gap, and padding inside the bar resolves as `clamp(min, height * factor, max)` — so a module that needed room under a banner had exactly one remedy, raising the height, and raising it enlarged the type as a side effect. The visibly larger bars in this suite are mostly not asking for large text; they were asking for room. The default is now a real 30px matching the primary bar, so the two read as one component and the stylesheet is the single place it lives; `registerSecondaryBarType` resolves through `getSecondaryBarHeight(typeId)` instead of its own constant. **Banners are now added on top.** `MenuBar._applyBannerAllowance` runs on every open and close and writes the banner height and an allowance (banner plus gap), and the allowance is spent in three places that all have to agree: the bar takes it as `padding-bottom` — it is `box-sizing: content-box` precisely so padding adds to the configured height rather than eating it — the toolbar becomes `calc(100% + allowance)` and top-aligned so it actually reaches into that padding, since padding alone would not have helped a child laid out in the content box with `overflow: hidden` clipping at the padding edge, and `--blacksmith-menubar-total-height` includes it so the interface below the menubar moves down to match. Both variables are `0px` for a bar without banners, making every rule that reads them an exact no-op there. A bannered item is now sized by the ordinary `.secondary-bar-item` rule and there is no bannered-item size rule left. **Sizing is expressed as a preset**, `size: 'default' | 'large' | 'xlarge'` (30 / 45 / 60), because a pixel value is a typography decision disguised as a layout one, and an unrecognised preset warns and falls back rather than failing silently. **`config.height` is no longer accepted at all** — it is ignored, with a warning naming the presets. It began this change as a documented escape hatch and was removed on the observation that every module in the suite had taken it: an escape hatch labelled "do not use this" is still the path of least resistance, and a design token with a per-caller override is not a token. Nothing is lost by removing it, which is the argument that settled it — all four sibling bars map onto a preset exactly, Herald's 60 onto `xlarge` and the rest onto `default` once banners stopped stealing height. A custom template is not an alternative route to a bespoke size: `templatePath` controls markup, and the bar still renders inside the same element and scales from the same variable. `openSecondaryBar(typeId, {height})` survives as a distinct mechanism — it re-opens a bar at a height *that bar* recomputed, which is what the encounter bar needs to switch between its in-combat and out-of-combat sizes, and is not a way to choose a size. `getSecondaryBarHeight` is now on `module.api`, having been a useful method no consumer could reach. **Sibling bars that set an explicit height will visibly change size, and that is the intent** — a bar that still looks wrong after this is a bar that has not migrated, which is a more useful signal than silence. The menubar also gains its first architecture doc, carrying the scale-factor model, the banner accounting, the four writers of the height variables, and the three custom-property traps that were each live bugs; it is on the wiki `PUBLISH` list. **Verify live**: open each Coffee Pub secondary bar and confirm a bar that asks for no size is exactly as tall as the menubar above it, with its text the same size as the menubar's; open a bar with group banners (Cartographer) and confirm its buttons are the same size as an unbannered bar's rather than shrunken, that the banner sits above them, and that the canvas below the menubar clears the taller bar with no overlap or gap; switch between a bannered and an unbannered bar and confirm the interface offset follows each time; and confirm the encounter bar is unaffected in and out of combat, since it sizes itself.

- **Encounter and token actions become bar buttons out of combat** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menubar-combatbar.css`): during an encounter the row's space belongs to the portraits, so the actions stay behind the Encounter and Tokens menus; outside one there is room, so the menus' contents are pulled out and rendered as ordinary buttons — Show/Hide Combat Tracker, Create Combat, Quick Encounter, Reveal Hidden, and the three canvas removals. The combat-only rows are absent, needing an encounter to act on. Both presentations read one definition, `getBarActions()`, so an action cannot behave differently depending on which one you reached it through, and the removals confirm either way. The buttons carry the shared `secondary-bar-item` classes rather than the combat bar's own, so they inherit the standard button appearance instead of being styled to imitate it. **The combat row now also re-bases the shared item sizing to its own height**, which is what makes that possible: shared components size themselves from `--blacksmith-menubar-secondary-height`, and since that is the height of the whole two-row bar, a button rendered in the combat row took its type size from roughly 70px and came out at 28px. The data row had shadowed that variable since it was introduced; the combat row had no need to until something shared was rendered there. Both rows now do, so anything shared placed in either adapts on its own — the rule being to give a row the correct basis rather than to style around a component that has the wrong one. **The combat row is also no longer rendered when it would be empty**: out of combat it holds only the GM's controls, so a player between encounters gets the data row alone rather than an empty strip, and the bar's height drops accordingly. **Verify live**: out of combat as GM, confirm the actions appear as buttons matching the look of other secondary bar buttons rather than oversized text, and that each still works and still confirms where it did; start a combat and confirm they collapse back into the two menus; and confirm a player out of combat sees only the data row with no empty space beneath it.

- **Encounter bar retired and merged into the combat bar (encounter bar merge, phase 8)** (`scripts/ui-journal-encounter.js`, `scripts/api-menubar.js`, `scripts/manager-combatbar.js`, `scripts/manager-encounter.js`, `scripts/timer-round.js`, `scripts/timer-combat.js`): the separate encounter secondary bar is gone — its type registration, its six items, its menubar tool, and its `secondaryBarToolMapping` entry are all removed, and the merged bar is relabelled "Encounter". Everything it carried now lives on the one bar: Create Combat, Quick Encounter, Reveal Hidden, the three canvas removals, and the challenge rating readouts. Identifiers deliberately stay as they are — the bar type is still `'combat'` and the settings keys still say `menubarCombat*`, because renaming the type would have collided with the retired one during the overlap and renaming settings keys is a data migration rather than a rename. Removing the bar orphaned three things, all deleted rather than left: `EncounterToolbar._refreshEncounterBarInfo` and its call site, and `EncounterManager.getDifficultyBorderColor`, whose palette had already been superseded by a bar-specific one. Two further pieces of dead code went with them: `timer-round.js` cached `.combat-endcap-left .combat-time-round` and `.combat-endcap-right .combat-time-total`, selectors that had never matched anything in any version of the combat bar and could not after the endcaps were removed, so `combatbarRound` and `combatbarTotal` are gone from the cache, its clear, its staleness check, and its tick. **The three canvas removals now confirm first** — they delete tokens with no undo — while Reveal Hidden does not, being reversible and used mid-turn. **`CombatTimer.startTimer` now sets `state.isActive`**, which only `resumeTimer` did before: the flag read as "has been resumed" rather than "is running", while `startTimer`'s own `combatTimerStateChange` payload already claimed `isActive: true`, so the hook and the state contradicted each other and the DOM-cache self-heal in `updateUI` that reads it could never fire for a normally-started timer. **Verify live**: confirm only one encounter-related secondary bar remains and its menubar tool reads "Encounter"; confirm Create Combat, Quick Encounter, Reveal Hidden, and the three removals all work from it; confirm each removal asks before deleting and does nothing when declined; confirm the journal encounter toolbars still show their own CR badges; and confirm the tracker's round and total timers still tick.

- **Architecture docs for the combat bar and the combat timers** (`documentation/architecture/architecture-encounter.md` new, `documentation/architecture/architecture-timers.md` new, `documentation/architecture/architecture-blacksmith.md`, `tools/wiki-sync.mjs`): two subsystems had no architecture coverage — the combat bar had a single line inside the MenuBar entry of the map doc, and the three timer modules had one line naming the files. Everything learned about them during this release lived only in the merge plan and in this changelog, and a plan is scaffolding that gets deleted on completion while a changelog is history rather than a spec, so that knowledge was scheduled to evaporate and be re-derived by grep. The two new docs carry what can only be learned by reading code: for the bar, why it is two rows (item sizing is pinned to bar height while the combat row must scale for portraits), how hybrid custom-template-plus-registered-items rendering works, the four height variables and what each drives, the three distinct custom-property traps that were each live bugs, the GM-only and canvas-versus-tracker scoping of the readouts, and the linked-token HP dedupe rule; for the timers, the countdown-versus-elapsed distinction, `getDisplayState()` as the single display contract, the visibility gates and the fact that `state.isActive` is not one of them despite the name, the shared band colours, and why per-tick updates must write DOM rather than re-render. Both are added to the wiki `PUBLISH` list and pointed at from `architecture-blacksmith.md`. **Verify**: both files render on the wiki after the next sync, and the pointers in the map doc resolve.

- **Combat bar and encounter actions now use the toast system** (`scripts/manager-combatbar.js`, `scripts/ui-combat-tracker.js`, `scripts/manager-encounter.js`, `scripts/utility-party.js`, `scripts/api-menubar.js`): every `ui.notifications` call reachable from the combat bar's menus is now a Blacksmith toast through `ToastAPI.show`. That covers Create Combat's five messages, the three canvas-clearing actions, Reveal Hidden, the roll-initiative permission warning, and Roll Remaining's "already rolled" notice. Related actions share a `stackKey`, so a run of presses replaces rather than piling up a column of Foundry banners. Two things changed beyond the swap. Create Combat reported "Combat created with N token(s)" even when it had added to a running encounter — harmless when the button only ever said Create Combat, but the bar's row now reads Add to Combat, so the message contradicted the control the user just pressed; the wording now follows which branch actually ran. Reveal Hidden previously logged its outcomes with notifications suppressed, so it was silent in every case except an error, which alongside three siblings that all report is indistinguishable from doing nothing; it now toasts what it revealed, or that there was nothing hidden. The party *deployment* messages in `utility-party.js` are left as Foundry notifications, since that path belongs to the party bar rather than this work. **Verify live**: trigger each action from the combat bar and confirm a toast rather than a Foundry banner; press Add to Combat twice and confirm the second toast replaces the first and reports adding rather than creating; and run Reveal Hidden with nothing hidden and confirm it says so.

- **Combat bar persists between encounters (encounter bar merge, phase 2)** (`scripts/manager-combatbar.js`, `scripts/api-menubar.js`, `templates/partials/menubar-combat.hbs`, `lang/en.json`): the bar's existence no longer depends on a combat existing. Combat state now decides what it *contains*: a new `getIdleBarData()` supplies the out-of-combat payload, and an `isInCombat` flag gates the portrait strip and its scroll arrows, both endcaps, and the Initiatives button. The Graveyard and the Begin/End Combat button needed no gating, since both already keyed off data that is empty when idle. This is what makes the encounter and token tools worth having on this bar at all — before it, they were only reachable while a combat was running, which is the state in which half of them do not apply. Seven separate places assumed a combat exists and all of them had to change together, since any one left behind reintroduces the disappearance in a different form: `openCombatBar` returned false without an active combat; `updateCombatBar` closed the bar when `game.combats.active` went away; the `deleteCombat` hook closed it outright; the `canvasReady` handler in `api-menubar.js` closed it on any scene without combatants; the load-time check only opened for a combat that already had combatants; the `combat-bar` menubar tool's `visible` predicate required an active combat, so the one control that reopens the bar disappeared for exactly the stretch the bar now covers; and the `_prepareSecondaryBarData` patch guarded on `!data.data`, a condition the base method makes unreachable by assigning `data.data = {}` for custom templates before the patch runs — so a bar whose payload had gone missing rendered from an empty object with no `isGM` and no `isInCombat`, which is to say a visible tray containing nothing. The load-time check is now `openCombatBarOnLoad` and opens whenever `menubarCombatShow` allows, which is what puts the bar up at the start of a session — the setting's hint, previously empty, now says so. `getCombatData` also returns the idle payload from its `catch` rather than an empty object, so an exception degrades to a working bar instead of a shell with no buttons. `closeCombatBar` survives as a deliberate API action; nothing calls it automatically now. This is phase 2 of the encounter bar merge; the bar is visibly thin out of combat until phase 4 fills it with Challenge Rating. **Verify live**: with no combat, confirm the bar is present on load carrying the Encounter and Tokens menus and nothing else; start a combat and confirm the portraits, endcaps, and Initiatives button appear; end it and confirm they disappear while the bar stays; switch scenes with no combat and confirm the bar survives; delete an encounter and confirm the same; and confirm turning `menubarCombatShow` off still suppresses the bar entirely.

- **Combat bar tracker button folded into the Encounter menu** (`scripts/manager-combatbar.js`, `templates/partials/menubar-combat.hbs`, `styles/menubar-combatbar.css`): the standalone tracker toggle at the left edge of the bar is gone, and Show/Hide Combat Tracker is now the first row of the Encounter menu, which occupies that slot instead. It reads "Hide Combat Tracker" when the tracker is open, since `CombatBarManager.toggleCombatTracker` has always toggled and a fixed "Show" label describes half of what the row does. The two menu buttons carry `action-type-general`, the same class the tracker button used, so they inherit its colour rather than defining a new one. Removing the button left the `data-control="toggleTracker"` branch of the bar's click handler with nothing to match, and a `combat-bar-menu-buttons` CSS selector doing exactly what the neighbouring `combat-bar-edge-button` already did; both are deleted. The `toggleCombatTracker` method itself stays — it is exposed on the module API and driven by a toolbar tool, neither of which went anywhere. **Verify live**: confirm the bar's leftmost control is now the Initiatives button, that both new buttons match the old tracker button's colour, that Encounter's first row opens the tracker and then reads "Hide Combat Tracker" when reopened, and that the Coffee Pub toolbar's tracker tool still works.

- **Combat bar portrait menu restructured into two zones with submenus** (`scripts/manager-combatbar.js`, `scripts/ui-context-menu.js`): the menu was a flat list of up to twelve rows separated only by rules, which had passed the point of reading at a glance. It is now a `core` zone of everyday actions — Pan to Token, Ping Token, Pop Out Combatant Card, **Hurry Up** (submenu: Send to Player, Send to Party), **Character** (submenu: View Character Sheet, View Portrait, and when GM: Update Participant plus Curator's image-replacement rows) — above a `gm` zone the shared menu already tints red, holding everything that changes the encounter: **Initiative** (submenu: Clear, Reroll), **Visibility** (submenu: Toggle Canvas Visibility, Toggle Combat Visibility), Set As Current Combatant, Toggle Defeated, Remove from Group, Remove from Combat. The two visibility toggles share a submenu rather than collapsing into one row because they hide different things — the token on canvas versus the combatant's tracker entry — and the distinction is the point. This uses `UIContextMenu`'s existing `{core, gm}` zone form rather than the flat-array form, so the red tint and the zone separator come from `styles/menu-context-global.css` with no new CSS. **Pan to Token and Ping Token are now GM-only for non-player-owned combatants** (`actor.hasPlayerOwner`): a player pinging a monster announces a token they may not be meant to know is there. The two rows are omitted rather than disabled in that case, since a greyed-out row still discloses the combatant. Blacksmith places whatever rows Curator returns into the Character submenu without knowing what they are, so the count and labels remain Curator's to decide. **Verify live**: as GM confirm both zones appear with the lower one tinted, that Hurry Up and Character open flyouts on hover, and that the Curator rows appear inside Character; as a player confirm the red zone is absent entirely, that Pan and Ping appear on a party member's portrait, and that they are absent on a monster's.

- **Context menu flyouts inherit their parent zone's tint** (`scripts/ui-context-menu.js`): `_buildSubmenu` hard-coded `context-menu-zone-core` on every flyout, so a submenu opened from a GM row rendered in the core colour and read as a different class of action than the row that opened it. The zone name now travels from `appendZone` to the item to the flyout via a `data-zone-name` attribute, defaulting to `core` so existing flat-array menus are unaffected. **Verify live**: open the Initiative flyout in the combat bar's GM zone and confirm it carries the same red tint as the rows behind it, and that the Character flyout in the core zone does not.

### Fixed

- **A secondary bar's menubar button no longer stays lit after another bar replaces it** (`scripts/api-menubar.js`): opening Artificer's bar and then Party's left Artificer's button in its selected colour, and nothing could turn it off again — the tool stayed lit for the rest of the session. Two faults, and the second is the one that did it. The generic click handler flips `tool.active` on **any** `toggleable` tool without knowing what that tool does, so a tool that opens a bar goes active by that route alone; but the only thing that ever cleared it was `_syncSecondaryBarButtonStates`, which looked up the *previous* bar type in `secondaryBarToolMapping` and did nothing when there was no entry. `registerSecondaryBarTool` is optional and only Herald, Minstrel, and Blacksmith's own party bar call it — Artificer and Cartographer never did, so their tools were lit by the generic path and cleared by nothing. The state was written in one place and cleared in another, and the two disagreed whenever a module had not opted in. **The active set is now derived rather than patched.** Only one secondary bar can be open, so a mapped tool is active exactly when its bar is the open one; the sync assigns `tool.active = barTypeId === newType` across every mapping instead of clearing one entry, which also heals a tool that went active by any other route. **And the mapping is learned when it is not declared**: a tool that opens a bar from inside its own `onClick` is that bar's tool, so `openSecondaryBar` records the association the first time it happens, using a tool id the click handler publishes for the duration of the call and clears in a `finally` — a handler that throws would otherwise leave a stale id to be misattributed to the next bar opened from anywhere. `registerSecondaryBarTool` remains the explicit declaration and still wins; it is now an optimisation for the first render rather than a correctness requirement. Since the answer no longer depends on what was open before, `_syncSecondaryBarButtonStates` drops its `previousType` parameter. The redundant second call in `openSecondaryBar` is also gone — it ran once before the bar was configured and once after, and each call re-renders the whole menubar. **Verify live**: open Artificer's bar, then Party's, and confirm Artificer's button returns to its unselected colour while Party's lights up; close the Party bar with its own button and confirm nothing is left lit; cycle Artificer, Cartographer, Herald, Minstrel, and Party in turn and confirm exactly one button is ever lit; and confirm a bar closed by its auto-close timer also clears its button.

- **Combat bar size setting now resizes the combat bar** (`scripts/manager-combatbar.js`, `scripts/settings.js`): `menubarCombatSize` moved the health rings and nothing else. Two different CSS variables were involved and the setting only ever fed the wrong one. The slider wrote `--blacksmith-menubar-secondary-combat-height`, which no stylesheet reads — its sole consumer is the ring geometry computed in `getCombatData`. Everything that determines the bar's actual size (`--portrait-container-height`, the portraits, the button containers) derives from `--blacksmith-menubar-secondary-height`, which `openSecondaryBar` sets from `options.height || barType.height`; `openCombatBar` passed no `height`, so the bar fell back to `barType.height` — captured once at registration from the 60px CSS default in `styles/menubar.css` and frozen for the session. The bar was therefore 60px tall wherever the slider sat, and `requiresReload: true` on the setting did not help, since a reload re-registered from the same default. The combat branch of the patched `openSecondaryBar` now resolves the setting and passes it as `height` on every open, so both bar-opening paths get it, and the setting-change handler resizes the live bar instead of waiting for a reload — that flag is now gone. This matters beyond the bar itself: `--blacksmith-menubar-total-height` is a `calc()` over the secondary height and offsets the Foundry UI beneath the menubar, so the wrong height displaced every element below it. Because total height is a `calc()` over the variable rather than a fixed value, updating the one variable carries the offset along. **Verify live**: with the combat bar open, drag the size slider and confirm the bar, the portraits, and the health rings all grow and shrink together with no reload; confirm the canvas and sidebar below the menubar shift to match rather than being overlapped or leaving a gap; then reload and confirm the bar opens at the chosen size, both from the menubar button and from starting a combat.

- **"Hide the Dead" is now a world setting** (`scripts/settings.js`, `lang/en.json`): `menubarCombatHideDead` was registered with `scope: 'user'` while its neighbour `menubarCombatHideHealthBars` — the other combat menubar visibility setting, registered directly above it — is `scope: 'world'`. The consequence only became visible once the Graveyard existed: a GM turning "Hide the Dead" on changed nothing for anyone else, so players kept a strip full of dead portraits and never got a Graveyard button, while the GM saw the opposite. Combatant visibility on the bar is a table-wide decision rather than a personal preference, and it now matches the health bar setting it sits beside. The hint text also said only that the dead are "hidden from the combat menubar", which no longer describes where they went; it now names the Graveyard button and states that the setting applies to every player. **Note for existing worlds: the scope change abandons the stored per-user values**, so the world setting starts at its default of off and the GM has to tick it once after updating. **Verify live**: as GM turn the setting on and confirm a connected player's bar loses its dead portraits and gains the Graveyard button without a reload; turn it off and confirm the dead portraits return and the button disappears; and confirm a player cannot change the setting themselves.

- **Combat bar order now follows the combat tracker on tied initiative** (`scripts/manager-combatbar.js`): the bar built its list by iterating `combat.combatants` and then sorting it with `b.initiative - a.initiative`. `Array.prototype.sort` is stable, so combatants with equal initiative kept the order of the source collection — roughly the order they were added to the encounter — while the tracker renders `combat.turns`, which Foundry sorts through `Combat._sortCombatants` and which the system may override with its own tiebreak. Two independent orderings that agreed only when no initiatives tied, and the tracker is the one Foundry actually advances turns through: "next turn" follows `combat.turns` regardless of what the bar shows, so a tie made the bar disagree with the turn that was about to happen. `getCombatData` now maps over `combat.turns` and does not re-sort, falling back to the collection only if `turns` is empty (before `setupTurns` has run). Two related symptoms go with it: un-rolled combatants read `combatant.initiative || 0`, which placed them among the zeros rather than last where the tracker puts them, and the drag-to-reorder handler derives a dropped portrait's new initiative from its DOM neighbours, so it was interpolating against the wrong neighbours whenever a tie sat nearby. **Verify live**: give two combatants the same initiative and confirm the bar's left-to-right order matches the tracker's top-to-bottom order, that advancing turns highlights the bar portraits in that same order, and that adding a third combatant to the tie does not change either list's agreement; then add a combatant without rolling initiative and confirm it sits last in both; then drag a portrait between two tied portraits and confirm it lands where dropped in the tracker as well.

## [13.12.4]

### Added

- **Request-side roll modes: `rollAdvantage` and `lockRollAdvantage`** (`scripts/window-skillcheck.js`, `scripts/manager-rolls.js`, `templates/card-skill-check.hbs`, `templates/window-roll-normal.hbs`, `styles/cards-skill-check.css`, `styles/window-roll-normal.css`, `styles/window-roll-cinematic.css`, `documentation/api/api-requestroll.md`): `openRequestRollDialog` accepts `rollAdvantage: 'advantage' | 'disadvantage' | 'normal'`, at the request level and per entry of `options.actors` where the per-actor value wins, plus a request-level `lockRollAdvantage` boolean. Until now a requesting module could set the DC, a situational bonus, and a custom modifier, but advantage was chosen only by the roller's own buttons at roll time — so a module applying its own rules had to state the required mode in the request title and then detect what was actually rolled by inspecting the formula for `2d20kh` / `2d20kl` (Bibliosoph's treatment rolls, request #5, 2026-07-30). It is **one field rather than two booleans** because `'normal'` has to be requestable: "the healer's kit and the self-treatment penalty cancel out" is a request for a straight `1d20`, which `advantage: false, disadvantage: false` cannot distinguish from "not specified". Default behavior is **pre-select, not enforce** — the requested button is marked in the Roll Configuration window and the cinematic overlay and named on the chat card, but all three stay live, because a requester that knows the mode is usually right and not always, and a card whose mode cannot be overridden takes a call away from the table. `lockRollAdvantage: true` renders only the requested button in both surfaces; `RollWindow._executeRoll` and the cinematic click handler each refuse a mismatched mode with a warning notification as a backstop for a click that reaches the handler through stale DOM. The mode rides the existing `situationalBonus` / `customModifier` path end to end — request options into message flags, global and per-actor, flags back out at `handleChatMessageClick` into `orchestrateRoll` and on to whichever roll surface opens — so roll execution is unchanged and still consumes the same `{ advantage, disadvantage }` pair built from the button that was clicked. Unrecognized values normalize to null and leave the roll unrestricted, so a typo cannot silently lock a card. Note the name: `rollMode` on this same options object is Foundry's roll privacy, and the two are unrelated. **Verify live**: a silent request with `rollAdvantage: 'advantage'` shows the mode on the card, opens the roll window with Advantage marked and all three buttons live, and produces a `2d20kh` formula in the result tooltip; adding `lockRollAdvantage: true` leaves exactly one button in the roll window and, with `isCinematic: true`, one button on each cinematic card; a two-actor request setting `'disadvantage'` on one actor only produces `2d20kl` for that actor and the request-level mode for the other; `rollAdvantage: 'normal'` with the lock rolls `1d20`; and a request with no `rollAdvantage` renders exactly as before, three live buttons with nothing marked.

- **`explanation` on a roll request** (`scripts/window-skillcheck.js`, `templates/card-skill-check.hbs`, `styles/cards-skill-check.css`, `styles/window-roll-cinematic.css`, `documentation/api/api-requestroll.md`): requester-authored prose rendered on the request card under an "About this Roll" header, and under the title in cinematic mode. `showRollExplanation` only ever toggled the standard skill description, so a module explaining conditions of its own — "a Healer's Kit grants Advantage here, and lowers the DC by 2" — had to put that in the request title or a separate toast, which is what gets missed mid-combat. The two are independent: set either, both, or neither, and when both are present the requester's prose comes first. It renders as **plain text in both surfaces** — Handlebars escapes it on the card and the cinematic path escapes it explicitly, since this string comes from a consuming module rather than from Blacksmith's own dictionary the way `skillDescription` does. **Verify live**: a silent request with `explanation` set and `showRollExplanation: false` shows the prose alone; with `showRollExplanation: true` both blocks appear, explanation first; with neither the card is unchanged; and a request carrying markup in `explanation` displays it literally rather than rendering it.

## [13.12.3]

### Added

- **`api.dialog` — shared DialogV2 helpers** (`scripts/api-dialog.js`, `styles/dialog.css`, `styles/default.css`, `scripts/blacksmith.js`, `scripts/window-pin-layers.js`, `documentation/api/api-dialog.md`, `tools/wiki-sync.mjs`): `confirm`, `choose`, `prompt`, and `wait` on `module.api.dialog`, wrapping `foundry.applications.api.DialogV2` with one dismissal contract, shared styling, and consistent promise results. The contract is the point: **user dismissal never rejects** — Escape and the title-bar close resolve `closeValue`, an explicit Cancel resolves `cancelValue`, and only a consumer callback throwing or a framework error can reject. Raw DialogV2 statics reject on dismissal unless `rejectClose: false` is passed, which is the detail call sites get wrong. `confirm` keeps a boolean result to match `DialogV2.confirm`; `choose`, `prompt`, and `wait` resolve `{ action, value, result }` with `action` one of `submit` / `cancel` / `close`. `content` accepts a string, an `HTMLElement`, or a promise of either — DOM support is required rather than cosmetic, because `utility-common.js:808` deliberately builds content as DOM so a copied snippet is never parsed as markup, and a string-only helper would have re-introduced that across the suite. Any node handed in is moved into a freshly created wrapper `div`, because DialogV2 rejects a content element carrying **any** attributes ("config.content element must have no attributes") — passing a consumer's `<div class="...">` straight through would throw, and wrapping means a consumer can put whatever attributes they like on their own element while listeners bound to it still fire. Enter activates the button marked `default`, including from inside a text input: HTML implicit submission would otherwise activate the first submit button in DOM order, and since `prompt` renders Cancel first so the row reads left-to-right, Enter in a text field silently cancelled the dialog and looked exactly like the user choosing to cancel (caught in live testing 2026-07-30). Every helper routes through the documented `DialogV2.wait()` with `rejectClose: false`, and three facts from the v13 API drove the design. `render` and `close` are `DialogV2WaitOptions` — options of the **static** methods, not the constructor, so `new DialogV2({ render })` silently ignores them; this module never constructs a dialog directly, and button classes, tooltips, and disabled state are applied from the `render` callback because `class` and `disabled` are not DialogV2 button fields. `wait()` resolves the button callback's return value, or the button's `action` string when that value is nullish, so submit buttons return a wrapper object and a collected value is never confused with an action name. And **DialogV2 has no supported way to stay open once a button is clicked** — so `prompt` validation is a reopen loop rather than an in-place error: a rejected value or a throwing `onSubmit` reopens the dialog with the message prepended to the content, bounded by `maxAttempts` (default 10) so a validator that can never pass cannot loop forever. Passing `content` as a function `({ value, error, attempt }) => html` preserves the user's input across a reopen. `confirm` uses explicit `confirm`/`cancel` buttons rather than `DialogV2.confirm`, so the action names are ours and styling is deterministic rather than dependent on Foundry's internal naming. Blacksmith dogfoods the API by converting the whole `window-pin-layers.js` cluster — 11 confirmations and 2 prompts, previously 13 hand-rolled DialogV2 calls each repeating `rejectClose: false` / `modal: true` / `yes` / `no` boilerplate — to the helpers, which also gives those dialogs explicit action labels (Delete Pin, Strip Everywhere, Rename Everywhere) instead of bare Yes/No, destructive styling on the ten destructive ones, focused inputs and empty-input rejection on the two prompts, and the same string-or-empty return their callers already expected. Both prompts also dropped the redundant `<form>` they wrapped their content in, since DialogV2 supplies one. Two deliberate behavior changes: the two prompts are now modal (they were not), and an empty value now reopens the prompt with a message instead of silently returning an empty string that the caller discarded without telling the user — the "Save Profile did nothing" case. **Verify live**: from the Pin Layers window exercise each converted dialog for accept, cancel, Escape, and title-bar close, and confirm no path throws an uncaught rejection into the console; confirm Blacksmith button styling and the destructive treatment appear on the delete confirmations; in both prompts confirm the input is focused on open, a valid value applies and reports through a notification, and an empty value reopens the dialog with the message and the previously typed text still present. `choose` ships with **no Blacksmith call site** — the pin-layers cluster contains no multi-way choices — so it is the one helper this change does not prove; exercise it from the console before a consumer depends on it.

- **`api.entityList` — shared selectable-entity component** (`scripts/api-entity-list.js`, `styles/entity-list.css`, `styles/default.css`, `scripts/blacksmith.js`, `scripts/api-menubar.js`, `scripts/window-toast-send.js`, `documentation/api/api-entity-list.md`, `tools/wiki-sync.mjs`): a single- or multi-select list of users, actors, tokens, or any consumer-described entity, for embedding in a window body or a dialog. `create(config)` returns a controller exposing `html` to inject, then `attach(root)`, `getSelection()`, `getSelectedIds()`, `setSelection(ids)`, and `destroy()`. Entities are described by `{ id, uuid, name, img, type, disabled, disabledReason, badges, metadata, className }`, and `getSelection()` returns the caller's own objects so a payload rides through untouched. It is deliberately an **embedded** component: it opens and closes nothing, submits no form, touches no socket, mutates no document, changes no ownership, and sends no notification, so it has no `{ action: ... }` result — that vocabulary belongs to `api.dialog` or the host window. Rows are native `radio`/`checkbox` inputs rather than a custom roving-tabindex widget, which means keyboard navigation, focus rings, group semantics, and screen-reader announcement come from the platform instead of being reimplemented, and a multi-select list stays readable with plain form APIs so a host can keep an existing form contract unchanged. A disabled entity can never be selected, including through `selected` or `setSelection`, since a host must not read back a selection the user cannot clear. Optional providers (`fromUsers`, `fromActors`, `fromTokens`) shape data only and filter nothing by permission. Styling lives in `styles/entity-list.css`, drives selection from `:has(input:checked)` so it cannot drift from the inputs, and reads `--blacksmith-tool-*` with fallbacks so a list hosted in a Light/Dark/Glass Tool window inherits that shell rather than punching an opaque panel through it. Blacksmith dogfoods both modes: **single-select** replaces the bare `<select>` in `MenuBar.showLeaderDialog` (which now shows portraits, carries the same `actorId|ownerId` value contract into `setNewLeader`, gains an explicit "No leader" row for clearing, and preselects from the stored `partyLeader.actorId` instead of matching the leader's display name, which duplicate actor names would break); **multi-select** replaces the hand-rolled recipient checkboxes in the Send Toast window, deliberately keeping the `toast-recipient` input name and the `blacksmith-toast-send-recipient` row class so all four send-path read sites and the Entire Party toggle handler are untouched. **Verify live**: set a party leader from the menubar, clear it with No leader, and confirm the stored setting and the menubar display both update; in Send Toast confirm offline players appear disabled with an Offline reason, Entire Party still checks and locks online players only, and a send reaches exactly the checked recipients.

- **`api.quantitySplit` — shared Give/Keep quantity control** (`scripts/api-quantity-split.js`, `styles/window-form-controls.css`, `scripts/blacksmith.js`, `documentation/api/api-quantity-split.md`, `documentation/design-system/design-components.md`, `utilities/tests/suite-quantity-split.js`, `tools/wiki-sync.mjs`): a range input flanked by the two halves of a split, where Keep is always `max - value`. `create(config)` returns a controller exposing `html` to inject, then `attach(root)`, `getValue()`, `getKeep()`, `setValue(n)`, and `destroy()` — the same shape as `api.entityList`, because a consumer composing a transfer window uses both in one body and two integration models there would be gratuitous. The value is always an integer within `[min, max]` whatever a host passes or a user does, so reading it needs no defensive clamping; `onChange` fires on user input only, not on `attach` or `setValue`. The interaction and styling were **contributed by Squire** rather than reconstructed from a description, which is the only way "preserve the existing Give/Keep experience" could be guaranteed; Blacksmith owns the naming, markup contract, CSS, and controller. Two changes were made to the contribution: it arrived as a Handlebars partial and is now generated markup for consistency with `api.entityList`, and the slider gained an `aria-valuetext` of the form "Give 3, Keep 4" so assistive technology announces the split rather than a bare number. Squire's own note that the previous Squire implementation relied on pseudo-element labels and a template-injected script is worth preserving as the reason this is a controller: Application V2 does not execute scripts inside injected body HTML, as `api-window.md` documents. Surfaces read `--blacksmith-tool-*` with fallbacks so a control hosted in a Light/Dark/Glass Tool window inherits that shell. **Verify live**: the Quantity Split suite in `utilities/test-harness.js` asserts the bounds matrix Squire supplied with the contribution — `max=1`, `max=2`, a large stack, initial values at both bounds, and Give + Keep equalling Max across the whole range including out-of-range input — plus DOM wiring and two independent controls in one form; then run its two interactive checks for mouse/keyboard behavior and Tool-theme readability.

- **Test harness for the public API** (`utilities/test-harness.js`, `utilities/tests/harness-lib.js`, `utilities/tests/suite-dialog.js`, `utilities/tests/suite-entity-list.js`, `utilities/tests/suite-quantity-split.js`, `utilities/tests/suite-window-delegation.js`): one entry point for the manual checks that were previously a growing pile of paste-into-console scripts with no shared conventions. Paste the launcher into a script macro and it loads the suites listed in its `SUITES` array — an explicit list rather than a glob, for the same reason `tools/wiki-sync.mjs` uses an explicit `PUBLISH` list: what runs should be a decision, not a side effect of what is on disk. Checks come in two tiers. **Headless** checks are contract assertions that self-report PASS/FAIL with no interaction, and a single "Run All Headless" button executes every one across every suite and prints one summary — this is the tier that catches a regression later, and it exists because the 2026-07-16 audit found that every defect it turned up was in an API Blacksmith does not call on itself. **Interactive** checks cover what only a person can judge: whether Glass is readable, whether keyboard navigation works, whether dismissal actually resolves. Each suite also declares a live-state box, so a check that correctly does nothing reads as "the feature is off" rather than "broken" — the idea is borrowed from Bibliosoph's harness, and it matters more here given the number of settings gates. The `api.dialog` and `api.entityList` scripts written alongside those APIs are folded in as the first two suites and their standalone versions removed, so there is one copy rather than two that drift. Foundry evaluates a script macro as an async function body, which is why the launcher uses top-level `await` and `return`; its dialog content is built as DOM rather than a string because `DialogV2` runs string content through `foundry.utils.cleanHTML` and the markup depends on inline styles and `data-*` attributes surviving. Suite imports carry a cache-busting query string, because `import()` caches by URL and a harness silently running the previous version of a suite is precisely the false confidence this is meant to remove. Nothing here is on the module load path and none of it ships to users. **It earned its place immediately**: the first live run surfaced two real defects (DialogV2 rejecting content elements carrying attributes, and Enter activating Cancel rather than the default button), and the Window Delegation suite now asserts the multi-instance dispatch case that shipped broken and had no coverage anywhere.

### Fixed

- **`ACTION_HANDLERS` dispatched every click to the last-rendered instance of a window class** (`scripts/window-base.js`, `scripts/window-pin-layers.js`, `scripts/window-json-import.js`, `scripts/window-toast-send.js`, `documentation/api/api-window.md`, `documentation/known-issues.md`): `BlacksmithWindowBaseV2` attached one `document` click listener per class and dispatched through `static _ref`, which every render overwrote with `this`. With two instances of one class open, a `data-action` click in either window was handled against whichever rendered last; closing the newer one nulled `_ref` and left the older window's buttons dead until it re-rendered. `BlacksmithToolWindowBaseV2` inherited both faults. The root cause was the handler signature — handlers were invoked as `fn(event, target)` and never received the instance, so every consumer invented its own lookup and all of them were singletons (three spellings inside Blacksmith alone, plus four more across sibling modules). Handlers are now invoked as `fn.call(instance, event, target, instance)`, and the listener binds **per instance on the window frame** rather than once per class on `document`: the frame is created before parts render and survives part re-renders, so it still catches late-injected body content, which was the only reason document-level delegation existed. That also fixes a second defect — the per-class document listener was never removed, leaking one permanent listener per window class per session. All 13 Blacksmith handler entries across five classes migrated to the instance argument; `static _ref` is retained as a deprecated shim so unmigrated consumers behave exactly as before rather than newly breaking. Nothing in Blacksmith had hit this, because every `ACTION_HANDLERS` consumer here is effectively single-instance — it surfaced while scoping Squire's transfer tool, which will be the suite's first deliberate multi-instance consumer. **Verify live**: open two `JsonImportWindow` instances with distinct `id` options and confirm each window's buttons act on its own content, then close the newer one and confirm the older window's buttons still work; separately exercise every migrated action — the importer's tab/copy/save/select/validate/import path, all three pin-layers windows, and Send Toast's send/cancel/browse/clear/icon/template/preview controls; confirm actions in late-rendered body parts still fire, and that opening and closing a window ten times leaves no accumulating `document` click listeners.


## [13.12.2]

### Fixed

- **Session-long memory and high-frequency lifecycle audit** (`scripts/window-base.js`, `scripts/manager-journal-dom.js`, `scripts/blacksmith.js`, `scripts/manager-combatbar.js`, `scripts/ui-combat-tools.js`, `scripts/sidebar-combat.js`, `scripts/manager-latency-checker.js`, `scripts/manager-navigation.js`, `scripts/api-menubar.js`, `scripts/api-effects.js`, `scripts/api-rolls.js`, `scripts/manager-hooks.js`, `scripts/pins-renderer.js`, `scripts/window-skillcheck.js`, `scripts/manager-gmnotes.js`, `scripts/ui-gmnotes-field.js`, `scripts/window-gmnotes.js`): closed ApplicationV2 windows no longer remain reachable through each subclass's static delegated-action reference, and pending position writes are cancelled on close. Journal discovery no longer watches every class/style mutation in Foundry's entire document: the body observer now handles child-list discovery only, while coalesced attribute observers are scoped to known journal sheets and disconnected when those sheets detach; the journal double-click edit-mode observer and DOM handlers also clean up on rerender/close. Combat-bar resize observers, combat-tracker portrait observers, and cloned-chat observers are now owned and disconnected instead of retaining replaced UI trees; chat cloning and combat-bar pointer movement are each coalesced to one animation-frame update per burst. Delayed latency, navigation, menubar-timer startup work is now owned and cancelled during cleanup, latency maps are released, and Hook Manager's bulk cleanup cancels pending debounced callbacks. Rolls API subscriptions now unregister by Foundry's hook ID, detach their AbortSignal listener on disposal, and immediately honor an already-aborted signal. Request Roll API completion callbacks are removed with their chat messages and bounded as a final safeguard. Pin canvas/update hooks now unregister with Foundry's required hook-name/id pair, and bursty scene reloads coalesce into one owned timeout that cleanup cancels. Active Effect condition metadata is cached instead of rebuilt for every displayed effect, with an explicit refresh method for modules that alter condition definitions at runtime. GM Notes coalesces overlapping field refreshes, enriches contributed sections concurrently, ignores stale async completions after destruction, prevents stale provider disposer functions from unregistering newer replacements, and debounces/serializes ProseMirror autosaves instead of issuing an overlapping document update per keystroke. Verify with an extended session: repeatedly open/close Blacksmith windows and journals, rerender/open/close the combat tracker and sidebar combined tab, enable then quickly disable latency, subscribe/unsubscribe Rolls API listeners, change scenes with pins enabled, post/delete Request Roll cards, and type rapidly in General and module GM Notes; confirm only live UI instances update, autosaves retain the final text, and detached-node/observer/callback counts stabilize after closures.


## [13.12.1]

### Added

- **First-class compendium and Journal support for the GM Notes API** (`scripts/manager-gmnotes.js`, `scripts/api-gmnotes.js`, `scripts/ui-gmnotes-field.js`, `scripts/window-gmnotes.js`, `styles/notes-gm.css`, `documentation/api/api-gmnotes.md`, `documentation/architecture/architecture-gmnotes.md`): `api.gmNotes` now resolves unloaded compendium documents through async `getAsync`/HTML/text/has siblings, resolves batches concurrently with `getMany`, reports locked-pack/permission/resolution capability through `canSet`, and offers typed `setOrThrow` failures while preserving the compatible nullable `set`. Envelope writes and clears preserve unknown future metadata. JournalPage change events add parent JournalEntry and breadcrumb context. Module-owned sheets can mount a reusable GM-only `createField`/`renderField` controller that owns async loading, enrichment, collapse state, locked/read-only presentation, canonical editor launch, live refresh, and cleanup. The editor itself resolves async targets, handles locked packs read-only, and binds actions per instance so multiple editors do not route Save/Close through one static reference. `PRESERVE_ON_REIMPORT` publishes GM Notes as mandatory user-data preservation for the future importer update-in-place stage.

- **Persisted Light/Dark/Glass Tool Window themes** (`scripts/window-tool-base.js`, `styles/window-tool.css`, `scripts/blacksmith.js`, `lang/en.json`, `documentation/api/api-window.md`, `documentation/architecture/architecture-window.md`): every lightweight Tool window now offers explicit Light, Dark, and Glass choices under **Theme** in its shared external context menu. Light retains the parchment presentation; Dark uses Blacksmith's established dark-window surfaces, a subtly translucent black outer border, dark dividers, light text, and gold accent; Glass supplies a translucent/frosted shell, subtle border and shadow, plus a discoverable hover/focus Micro rail while leaving consumer content opacity under consumer control. The choice is remembered independently per tool and can be initialized, changed, locked, or made session-only through `toolTheme`, `setToolTheme()`, and the related options. Consumers receive stable `api.toolThemes.LIGHT` / `DARK` / `GLASS` constants. Theme changes propagate through the shared CSS variables/classes/data attribute, `toolTheme` / `toolThemeIsDark` / `toolThemeIsGlass` template context, an overridable `onToolThemeChanged()` callback, and the global `blacksmith.toolWindowThemeChanged` hook.

- **Minimal Micro menu affordance** (`scripts/window-tool-base.js`): Micro title bars use a single Font Awesome dot for the shared context-menu launcher; Full title bars retain the vertical ellipsis.

## [13.12.0]

### Added

- **Multi-contributor GM Notes sections** (`scripts/manager-gmnotes.js`, `scripts/api-gmnotes.js`, `scripts/ui-gmnotes-field.js`, `scripts/window-gmnotes.js`, `styles/notes-gm.css`, `documentation/api/api-gmnotes.md`, `documentation/architecture/architecture-gmnotes.md`): GM Notes now keeps Blacksmith-owned General separate from namespaced module annotations. Modules can store owned sections with `setSection()` or register live, read-only content with `registerProvider()` when the authoritative text already lives in module data. The shared `createField()` component presents one flat, ownership-first GM NOTES group: its item-style chevron header collapses the whole area, while General, persisted sections, and contributed sections render expanded beneath it with module attribution. The presentation is integrated directly into the host page rather than framed as a nested widget: the GM NOTES row has no trailing rule, inner section titles use the page background, and titles and bodies share the host page's left content edge without colored borders, card outlines, or extra horizontal indentation. The feather is reserved for editable-section actions. Per-section hide/collapse controls were removed. Persisted sections declaring `editable: true` receive an edit action and save through their namespace; provider sections remain derived/read-only and may declare `sourceHint`. General writes and clears preserve module sections, provider content is never persisted, provider failures are isolated, and the re-import contract distinguishes General preservation from section merging. Verify live with Bibliosoph: mount one field on an Injury page, confirm General and “Running This Injury” align with the surrounding injury text as flat sibling sections, the latter starts open with no eye control, the group chevron collapses/restores both, General's feather opens its editor, and a second editable persisted section opens and saves without overwriting either.

- **Lightweight Application V2 tool/palette window style** (`scripts/window-tool-base.js`, `templates/window-tool-template.hbs`, `styles/window-tool.css`, `scripts/window-base.js`, `scripts/blacksmith.js`, `documentation/api/api-window.md`, `documentation/architecture/architecture-window.md`): modules can now extend `api.BlacksmithToolWindowBaseV2` (or `getToolWindowBaseV2()`) for compact utilities that remain open over the canvas without inheriting Blacksmith's full editor layout. Tool windows retain Foundry's native dragging, focus/z-order, minimize, close, and lifecycle behavior; provide an optional compact toolbar and footer around a scrollable body; support title actions through `getToolHeaderActions()`; and remember their user position by default. The shared base supplies the complete parchment surface, gold border, display-type title bar, matching controls, and shadow even for an empty consumer window; modules own their body content rather than rebuilding the frame. `toolTitlebar` provides two native Application V2 chrome modes: backward-compatible `full`, and `micro`, a 14px drag rail whose faint hover/focus single-dot launcher—or right-click anywhere on the rail—opens consumer actions plus Minimize/Restore, Reset Position, and Close. The same menu switches between Full and Micro, remembers the user's choice per tool, and can be locked or made session-only by the consumer. `api.windowStyles` exposes stable `STANDARD` and `TOOL` identifiers, while `api.toolTitlebars` exposes `FULL` and `MICRO`. The common base now applies size constraints to Application V2's actual `.application` frame and supports `rememberPosition` / `windowPositionKey`. Blacksmith dogfoods the new style by migrating persistent combatant hover-card pop-outs from custom floating DOM to the shared tool base while preserving multiple cards, live effect/stat refresh, Follow Combat, and per-card close behavior. Verify: pop out two combatants, drag/minimize/restore them, enable Follow Combat on one, and advance turns — only the following card changes and both remain native, independently closable Application V2 windows; then subclass the tool base externally and verify both title-bar modes, the mode switch and persistence, the shared empty-window shell, body, optional toolbar/footer, title action state, context menu, reset position, and saved position.

### Fixed

- **Tool title-bar menu was clipped by compact Tool windows** (`scripts/window-tool-base.js`, `styles/window-tool.css`, `lang/en.json`, `documentation/api/api-window.md`, `documentation/architecture/architecture-window.md`): Full and Micro title bars no longer open Foundry's frame-owned controls dropdown. Their ellipsis and title-bar right-click launch Blacksmith's shared `UIContextMenu` at the document level, keeping the complete action/mode/minimize/reset/close menu visible outside even the smallest tool frame.

- **Tool title-bar menu toggle attempted to mutate Foundry's frozen Application V2 options** (`scripts/window-tool-base.js`, `documentation/api/api-window.md`): switching a rendered Tool window from Full to Micro threw `Cannot assign to read only property 'toolTitlebar'`. The configured option is now read once as the initial value; runtime and persisted choices live in mutable instance state and are changed only through `setToolTitlebarMode()`. **Live-verified 2026-07-28** on the combatant card: Full → Micro → Full works, the menu remains usable, and the selected mode persists.

## [13.11.6]

### Added

- **Shared Active Effects API, combat hover-card status display, and persistent combatant cards** (`scripts/api-effects.js`, `scripts/manager-combatbar.js`, `scripts/blacksmith.js`, `api/blacksmith-api.js`, `scripts/settings.js`, `styles/menubar-combatbar.css`, `lang/en.json`, `documentation/api/api-effects.md`, `documentation/architecture/architecture-effects.md`): Blacksmith now exposes a read-only `module.api.effects` surface so Blacksmith, Crier, Bibliosoph, and other modules can filter and present Foundry Active Effects consistently instead of reimplementing the same dnd5e condition logic. `getActiveEffects()` preserves Actor effect order while excluding disabled/suppressed entries and selecting statuses, temporary effects, named conditions, and registered outcomes; async `getDisplayEffects()` adds localized condition names, remaining duration, permission-safe enriched descriptions, and the compact `Type · Context · Duration` display model. A priority-ordered classifier registry (`registerClassifier` / `unregisterClassifier`) keeps module-owned rules outside Blacksmith, with a low-priority compatibility classifier for Bibliosoph's established `outcomeBurst` injury/critical/fumble flag. The API is available directly, via `BlacksmithAPI.getEffects()`, and as the late `BlacksmithEffects` convenience global; `blacksmith.effects.changed` / `onChanged()` reports local create/update/delete operations. Blacksmith dogfoods the API on combat portrait hover cards: a new **Status and Conditions** section shows 34px effect rows and rich tooltips, remains absent for empty or limited-player NPC cards, responds live to Active Effect changes, and can be disabled per user with **Show Status and Conditions**. The portrait context menu now also offers **Pop Out Combatant Card**: each combatant can have one persistent, draggable, closable card, multiple combatants can be open together, reopening an existing one raises it, and HP, initiative, effects, and the effect-display setting refresh in place; removing the combatant or ending combat closes its card. A crosshairs toggle in each popped-out title enables **Follow Combat**: the card switches to the current combatant when the turn advances without moving on screen, while turning the toggle off pins it to whichever combatant it is currently showing. Verify live: hover a combatant carrying an ordinary Charmed condition, a timed effect, and a Bibliosoph critical/fumble/injury outcome — enabled entries appear once and in Actor order with correct type/context/duration; disabled or suppressed effects do not; changing or deleting an effect updates the open card; a non-owner player hovering an NPC sees no effect section; turning off the setting removes it; register a test classifier and confirm its label wins according to priority. Right-click two portraits and pop both cards out — both remain open and draggable, reopening one raises it instead of duplicating it, sheet/effect/initiative changes refresh without moving it, its close button removes only that card, and deleting a combatant or ending combat removes the corresponding persistent card. Enable Follow Combat on one card and advance turns — only that card changes combatants and its position stays fixed; disable it and advance again — it remains on the last combatant shown.

### Fixed

- **Injury prompt contradictions and the duration "Permanent" type trap** (`prompts/prompt-injuries.txt`, `scripts/api-core.js`): the legacy injuries prompt gave the model two conflicting IMAGE instructions — "set this to none" and, twelve lines later, the category-to-image mapping — so whether an imported injury card rendered art was a coin flip; the IMAGE field now defers to the mapping (with "none" only for unmapped categories). The prompt also left STATUSEFFECT unspecified when no effect applies (now explicitly an empty string), claimed Foundry "version 11" on a v13-minimum module, and had its typos corrected; it now also states that all JSON values stay quoted strings. On the code side, `convertSecondsToRounds` and `convertSecondsToString` (`api-core.js`, also exposed via the utils API) only recognized the *string* `"0"` as "Permanent" — a numeric `0` from properly-typed JSON would have rendered an injury as lasting "0" rounds; both now coerce with `Number()` first, so `"0"`, `0`, and empty or non-numeric durations all read as Permanent, and real values convert as before (`"18"` → 3 rounds). Verify: import an injury JSON with `"duration": "0"` and another with `"duration": 0` — both cards read Permanent; `"duration": "18"` reads 3 rounds; generate an injury with the updated prompt — the card carries the category image and the JSON contains `"statuseffect": ""` when no effect was chosen.

## [13.11.5]

### Added

- **Midi-QOL Integration setting** (`scripts/settings.js`, `scripts/utility-midi-resolution.js`, `scripts/manager-roll-outcomes.js`, `scripts/stats-combat.js`, `scripts/stats-player.js`, `lang/en.json`, `documentation/api/api-rolls.md`): Blacksmith's stance on Midi-QOL is now explicit and user-controllable, matching the Dice So Nice pattern — a world setting, Midi-QOL Integration (`enableMidiIntegration`, Roll System > Integrations, default on), decides whether Blacksmith leverages Midi workflows when the module is active. Blacksmith has never had a hard Midi dependency (no imports; every Midi hook registration was already gated on the module being active, and message-flag reading is passive), but the "core lane yields to the Midi lane" branches assumed that Midi installed meant Midi wanted. The new `isMidiIntegrationEnabled()` helper (`utility-midi-resolution.js`: module active AND setting on) is now checked at runtime by every Midi lane — the rolls API outcome emitters, combat statistics, and player statistics handlers — and by every core-lane yield branch, so disabling the setting makes the core dnd5e lanes reclaim processing, including Midi-flagged chat messages. Runtime checking means the toggle applies live with no reload, again like Dice So Nice. Verify live (world with Midi-QOL active): with the setting on, an automated Midi attack fires `attackResolved` once with `source: 'midi.attack'`-family metadata; toggle it off and attack again — the outcome still fires once, now from the core chat lane, and combat stats keep counting; without Midi installed the setting is inert and everything behaves as before.

- **`damageResolved` event on the rolls API** (`scripts/manager-roll-outcomes.js`, `scripts/api-rolls.js`, `documentation/api/api-rolls.md` — built to Bibliosoph's API request): `rolls.on('damageResolved', ...)` / `Hooks.on('blacksmith.rolls.damageResolved', ...)` now fires whenever dnd5e applies damage or healing to an actor, from any path that runs `Actor#applyDamage` — chat card damage buttons, sheet application, or MIDI's automation. Blacksmith performs the two-hook correlation every consumer was otherwise doomed to re-implement (Bibliosoph's injury triggers already had): `dnd5e.calculateDamage` stashes the typed damage breakdown and a pre-application HP snapshot by actor uuid, and `dnd5e.applyDamage` correlates within a 5-second window and emits. The payload carries `kind: 'damage'`, the applied `amount` (negative for healing, with `isHealing` flagged — healing is delivered, not filtered, so consumers choose), `tempAbsorbed` (temp-HP soak derived from the snapshot), the typed `damages` array, actor/token/scene identifiers (token best-effort for linked actors), and `hp: { before, after, max, temp }` so threshold logic — massive hits, dropped-to-bloodied, hit zero — is a one-liner. Delivery matches the attack lane's promise: the hook fires on the GM client, with non-GM appliers (a player using their own sheet) forwarding over a new `cpbRollDamageResolved` socket relay. Damage is not a roll, so the event deliberately does not also fire the generic `resolved` hook, which stays d20-shaped for existing subscribers. `attackerTokenId` and `itemUuid` ship in the payload but are always null for now — attribution is resolvable from MIDI workflows and is captured as follow-up work in `TODO.md`, with null the documented default per the request. The damage hooks register only on the dnd5e system. Verify live: register `Hooks.on('blacksmith.rolls.damageResolved', console.log)` on the GM client; a chat-card damage application logs amount, typed breakdown, and hp before/after matching the sheet; healing logs `isHealing: true` with a negative amount; damage into temp HP reports the absorbed portion; a player applying damage to their own sheet produces the log on the GM client, not theirs; a skill check fires `resolved` without `damageResolved`.

- **Toast call to action** (`scripts/api-toast.js`, `styles/toast.css`, `documentation/api/api-toast.md`): `show()` accepts a `callToAction` config — a button-styled label ("Roll for the Crit Card") rendered below the toast text that makes it visually unmistakable the toast wants a click. It is deliberately not a separate control: there is still exactly one click action, the CTA sits inside the toast's existing click target, and the body `onClick` handles it with unchanged dismissal semantics (acted-on removal, no `onDismiss`) — Phase 2's multi-button `actions` row remains reserved for genuinely multi-choice toasts. The CTA renders only on small/medium/large billboards (`ToastManager.CTA_SIZES`; not stacked toasts, not fullscreen — author decision 2026-07-25) and only when `onClick` is a live function, since a call to action without an action would be a lie; because the cross-client relays strip callbacks, a relayed toast never shows one — the audience is consumers calling `show()` receipt-side, e.g. a rolls consumer decorating a crit billboard fired from the new `blacksmith.rolls.resolved` hook. Styling follows the toast's accent custom property (pill button, tinted wash, glow on the existing whole-toast hover) and scales with the billboard size; the label lands via `textContent`, never parsed as HTML. `getActive()` includes `callToAction` in its display metadata. Verify live: `api.toast.show({ title: "CRITICAL HIT!", size: 'medium', animation: 'slam', callToAction: "Roll for the Crit Card", onClick: () => console.log('rolled') })` shows the pill button below the text, hovering anywhere on the billboard lights it up, clicking anywhere (button included) logs once and removes the toast without firing `onDismiss`; the same call without `onClick`, without `size`, or with `size: 'fullscreen'` renders no button; with `color:` set the button wears the accent.

## [13.11.4]

### Added

- **Roll outcome classification API (`module.api.rolls`)** (`scripts/utility-roll-classification.js`, `scripts/api-rolls.js`, `scripts/blacksmith.js`, `documentation/api/api-rolls.md`, `documentation/plans/plan-rolls-classification.md`): sibling modules can now ask what a roll *meant* — crit, fumble, success vs DC, hit/miss vs AC — instead of re-parsing chat cards themselves. The public surface is `game.modules.get('coffee-pub-blacksmith').api.rolls`: `classify(input, options)` for pull classification against a `ChatMessage`, Foundry `Roll`, or `{ workflow, attackRoll }`; `extractActiveD20(roll)` for advantage/disadvantage kept faces; and `on(event, callback)` subscribing to `blacksmith.rolls.resolved`, `skillCheckResolved`, and `groupResolved`. Request Roll / skill-check cards emit `skillCheckResolved` once per roller from the GM `handleSkillRollUpdate` path (not re-firing earlier actors when a group recalculates), with `groupResolved` when all actors finish; DC values coerced from string settings so `success` and `dc` are never null on valid cards. Hidden/blind/GM-only rolls respect visibility — clients who should not see the roll do not receive hook payloads. Classification logic previously scattered across `manager-rolls.js`, `blacksmith.js`, `utility-message-resolution.js`, and `utility-midi-resolution.js` is centralized in `utility-roll-classification.js`; stats and token-blood paths are unchanged. MIDI is not required — `classify()` reads workflow shapes when present but Blacksmith has no hard dependency on midi-qol. Wiki: [api-rolls](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/api-rolls). Verify live: `game.modules.get('coffee-pub-blacksmith').api.rolls.isAvailable()` → true; Request Roll with DC 15, roll 22 → `skillCheckResolved` payload shows `success: true`, `dc: 15`; group roll with three actors → three hooks then one `groupResolved`; `rolls.classify(message, { tokenId })` matches the hook payload.

- **Roll outcome API: attack hooks (core-first, MIDI optional)** (`scripts/manager-roll-outcomes.js`, `scripts/blacksmith.js`, `documentation/api/api-rolls.md`): `blacksmith.rolls.attackResolved` now fires when an attack is classified — the piece Bibliosoph and other consumers need for crit reactions, injury tables, and "Big Hit!" automation. **Core lane (primary):** on the GM client, `createChatMessage` and `updateChatMessage` run `classify(message)` when `resolveAttackMessage` succeeds on dnd5e attack cards (the same dual-hook pattern token blood and combat stats use, because dnd5e fills rolls and target flags on a later update). When midi-qol is active, messages carrying `midi-qol` flags are skipped on this lane so the same swing is not emitted twice. **Optional MIDI lane:** when the module is present, `midi-qol.hitsChecked` emits authoritative hit/miss; `midi-qol.RollComplete` stages crit/fumble for merge into that emit (same pending-crit pattern as `stats-combat.js`). Dedupe keys are `rolls:chat:{messageId}` and `rolls:midi:{workflowKey}`; non-GM MIDI rollers forward to the GM via `cpbRollAttackResolved` on the existing socket. Not gated on `trackCombatStats` or combat being started — the rolls API works even when combat stats are off and with no MIDI installed. Verify live: without MIDI, make a targeted dnd5e attack → console listener on `rolls.on('attackResolved', …)` logs `meta.trigger: 'dnd5e.chatMessage'` with hit/miss lists; with MIDI active, one hook with `midi.hitsChecked`, nat-20 crit merged; skill-check hooks unchanged; MVP crit/fumble counts unchanged (stats lane untouched).

### Changed

- **Roll system internal migration (Phase 2)** (`scripts/manager-rolls.js`, `scripts/blacksmith.js`): duplicated d20 parsing in window/cinema roll paths now uses shared `extractActiveD20`; cinema overlay success/failure styling uses the card's real DC instead of a hardcoded 10; GM skill-check flag annotation uses `classifyCritFumble` instead of inline nat-20/1 checks. Behavior unchanged for players — same sounds and card flags, one classification authority.

- **Wiki: Rolls API published** (`tools/wiki-sync.mjs`, `documentation/guides/guide-registering-with-blacksmith.md`): `api-rolls` added to the wiki publish set; Home sub-API table documents `blacksmith.rolls` and `openRequestRollDialog` with links to [api-rolls](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/api-rolls) and [api-requestroll](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/api-requestroll).

## [13.11.3]

### Added

- **Combat bar: drag portraits to reorder initiative** (`scripts/manager-combatbar.js`, `styles/menubar-combatbar.css`): the GM can now drag a portrait left or right along the combat bar to change its place in the initiative order, mirroring the native tracker's reordering. A press only becomes a drag after 8 pixels of movement (the same click-vs-drag disambiguation the pins renderer uses), so single-click pan, double-click set-current, the hover card, and the right-click menu all behave exactly as before; once dragging, the portrait dims in place and a ghost of it rides the pointer, dropzones injected between the portraits spread the row apart tracker-style with the nearest one lighting up as the drop target (the row also gains end padding for the duration of the drag, so the first and last slots stay reachable instead of sitting cramped against the bar controls), the hover card stays hidden, and Escape cancels. On drop the combatant's initiative is written to the midpoint of its new neighbors (rounded to two decimals; dropping past the left end writes top + 1, past the right end bottom - 1; combatants without initiative count as 0), via `combat.setInitiative`, so the new order propagates to the native tracker and every client; every client gets a "«name» moved to position X of Y" toast wearing the moved combatant's portrait (token-art fallback; list icon when the actor has no image) with the new initiative as the subtitle (broadcast — the order change is table-visible, so its announcement is too), and dropping a portrait back into its own slot (either zone flanking it) writes nothing. Two guards handle the bar's re-render churn: `updateCombatBar()` defers any rebuild that lands mid-drag (a rebuild would yank the element from under the pointer) and applies it at drag end, and the click that the browser fires after a drag's pointerup is consumed so it cannot pan the canvas. Player clients are untouched — the pointer handlers exit immediately for non-GMs. Verify live: as GM with several combatants, drag a portrait between two others — the ghost follows the pointer, the row spreads with dropzones and the nearest lights up, the drop reorders the bar and the native tracker identically on all clients, the combatant's initiative reads as the neighbor midpoint, and the "moved to position X of Y" toast appears on every connected client; drag past either end — it becomes first/last; press Escape mid-drag — nothing changes; click and double-click a portrait — pan and set-current still work; drop a portrait exactly where it started — no update fires; as a player, dragging does nothing.

## [13.11.2]

### Changed

- **Combat bar portrait menu reorganized, with View Portrait and a group escape hatch** (`scripts/manager-combatbar.js`): the portrait context menu now reads in four separated sections — token actions (Pan to Token, Ping Token), nudges (renamed Hurry Up (Player) and Hurry Up (Party), helper text removed), sheet and imagery (View Character Sheet, plus a new View Portrait that opens the actor's image — token art fallback — in Foundry's ImagePopout; Curator's image-replacement items now inject here instead of between the GM controls), and GM combat control (Toggle Combat Visibility, Toggle Canvas Visibility, Set As Current Combatant, Remove from Combat). The two visibility toggles are deliberately distinct: Toggle Combat Visibility is the old Toggle Visibility renamed — it hides the combatant's tracker entry (`combatant.hidden`) — while the new Toggle Canvas Visibility flips the token's own hidden state on the canvas (`tokenDoc.hidden`), the one that actually conceals the token from players; it is disabled when the combatant has no token on the current scene. One new GM item rides that last section: Remove from Group, shown only when the combatant belongs to a v13 combatant group, which clears the combatant's `group` field so both the native tracker and the bar treat them individually again — the bar itself deliberately never renders group rows, since it maps over `combat.combatants` directly, so ungrouping is the only group interaction it needs. The menu switched from the zone-based layout to a flat item list with explicit separators to get the four-section order exactly. Verify live: right-click a portrait as GM — the four sections appear in order with no helper text under the nudges; View Portrait pops the actor image; with Curator enabled its replace items sit in the imagery section; group two combatants in the native tracker, right-click one on the bar — Remove from Group appears, clicking it splits them back out in the tracker; as a player only the first three sections show, without Curator or GM items.

- **Blacksmith's own transient toasts now auto-dismiss after 3 seconds** (`scripts/api-menubar.js`, `scripts/token-movement.js`, `scripts/timer-notifications.js`, `scripts/window-toast-send.js`): every fading toast the module fires itself — the leader-change and movement-change announcements, all timer announcements routed through `routeTimerNotification`, the hurry-up nudge billboard and its sender confirmation, and the Send Toast / Quick Toast "Toast sent" confirmations — previously lingered 4 to 10 seconds; all now use a uniform 3. The `api.toast.show()` default for consumers is unchanged at 8 seconds (it is a documented contract other modules may rely on), and the adhoc Send Toast template presets keep their own durations since the GM picks those in the window. Verify live: change the party leader, change movement type, fire a timer event on the Toast channel, and send a hurry-up nudge — each toast fades after roughly 3 seconds.

- **Billboard toasts grow with their content instead of scrolling** (`styles/toast.css`, `scripts/api-toast.js`, `documentation/api/api-toast.md`): the small/medium/large billboard presets previously fixed both dimensions, so a message longer than the box (the Hurry Up nudge banter in a small billboard, for instance) clipped mid-sentence behind an inner scrollbar. The preset heights are now minimums (`min-height`) with `height: auto` — the box keeps its designed proportions for short content and grows to fit longer messages, so ordinary content never scrolls. A 90vh cap keeps pathological content from pushing the box past the screen; only beyond that cap (or beyond the viewport on fullscreen) does the text block fall back to scrolling. Widths are unchanged. Verify live: `api.toast.show({ title: "Hurry up!", subtitle: "<several sentences of text>", size: 'small' })` — the box is taller than the preset minimum, all text is visible, and no scrollbar appears; a short-message billboard renders at the same size as before.

- **Hurry Up nudges are now toasts with Direct and Blast scopes** (`scripts/timer-notifications.js`, `scripts/timer-combat.js`, `scripts/manager-combatbar.js`, `scripts/settings.js`, `lang/en.json`): both nudge triggers — the combat tracker timer bar's "TELL «name» TO HURRY UP!" overlay and the combat bar portrait menu — previously posted a public banter chat message (with the message array duplicated verbatim at both sites) and played the nudge sound table-wide. Both now route through a shared `sendHurryUpNudge()` helper gated by a new Hurry Up Nudges channel setting (`notifyHurryUp`, Notifications section under Combat Timer: toast / chat / both / none, default both). The toast half is a small billboard with the `shake` animation (3 seconds, wearing the combatant's portrait) and comes in two scopes: **Direct** delivers it over the internal targeted relay only to the active non-GM users who own the slow combatant's actor — the sender gets a local "Nudge sent to «name»" confirmation toast, nobody else sees it, and if no owner is online the nudge is simply not delivered: the sender sees a local "«name»'s player is not online" notice, and the channel setting stays absolute (an earlier build fell back to the chat card here, which made toast mode look like it ignored the setting) — while **Blast** broadcasts the billboard to every connected client for the full table-razzing effect (the sender sees it too, so there is no confirmation). The combat bar portrait menu now offers both as separate entries — labeled Hurry Up (Player) for the direct nudge and Hurry Up (Party) for the blast; the combat tracker's timer overlay always blasts, matching its pre-toast public-chat behavior. The toast wears the slow combatant's face — their portrait (token art fallback) as the round avatar, with the rabbit icon covering actors that have no image — while the chat card's header now shows the rabbit instead of the old hourglass (`templates/card-hurry-up.hbs`). The nudge settings also moved into their own Notifications > Hurry Up section: the new `notifyHurryUp` channel plus `hurryUpSound`, which relocates from the combat timer section — same setting key, so stored values carry over. Chat mode is the public `card-hurry-up.hbs` banter card plus the table-wide sound (both trigger sites now use the card template; the timer-bar overlay previously posted bare text); in both mode the toast goes out silent, since the chat broadcast already reaches everyone including the target. Verify live: with a GM, the slow player, and a third player connected — on the default both mode, Hurry Up (Direct) gives the slow player the billboard (wearing their character's portrait) plus the card with one sound while the third player gets only the card and the GM sees the confirmation; Hurry Up (Blast) puts the billboard on every screen including the GM's, plus the card; the tracker overlay (shown on a non-active player's client while the combat timer runs) blasts identically; toast mode sends Direct's billboard with the sound riding the payload and no card; chat mode posts only the card, its header showing the rabbit; none does nothing; Direct on an unowned NPC or with the target's player offline posts no card in toast mode and shows the sender the not-online notice; the Hurry Up settings appear as their own subsection in Notifications with the sound dropdown beside the channel choice, remembering the previously configured sound.

### Fixed

- **Deprecated `CONST.CHAT_MESSAGE_TYPES` removed from all chat card creation** (`scripts/timer-notifications.js`, `scripts/manager-reputation.js`, `scripts/ui-sidebar-style.js`): four `ChatMessage.create` sites still passed `type: CONST.CHAT_MESSAGE_TYPES.OTHER`, which Foundry v12+ logs as deprecated (renamed to `CHAT_MESSAGE_STYLES`; compatibility support removed in v14) — the hurry-up nudge card surfaced it as a console error during testing. The field is simply dropped at all four sites, since OTHER is the default style; `window-skillcheck.js` had already made the same change. Verification: fire a hurry-up nudge in chat mode, post a reputation card, and toggle Manual Rolls — each message posts normally with no deprecation warning in the console. (The separate `renderChatMessage` deprecation in the same console log traces to Bibliosoph, not Blacksmith — recorded in `TODO-GLOBAL.md`.)

- **Players no longer get "lacks permission to delete ChatMessage" banners when combat starts with Hide Initiative Roll enabled** (`scripts/blacksmith.js`): the initiative-card hide hook runs on every client via `renderChatMessageHTML`, and after hiding the card it also attempted the document delete on every client — a GM-only operation, so each player's client earned a red permission banner from the server for every initiative roll (the promise rejection was caught, but Foundry surfaces the socket denial as a notification regardless). Hiding remains every client's job; the delete now runs only on the active GM's client (`game.users.activeGM?.isSelf`, which also prevents two logged-in GMs racing the same delete), and the deletion propagates to all clients as before. The Dice So Nice wait-for-animation path is skipped entirely on non-GM clients, since it existed only to time the delete. If no GM is connected, cards are hidden locally but not deleted — the visual intent of the setting still holds. Verify live: with Hide Initiative Roll on and a GM plus a player connected, start combat and roll initiative for several combatants — no permission banners appear on the player client, the cards never show in chat on either client, and with Dice So Nice active the dice animation still plays before the messages vanish.

## [13.11.1]

### Added

- **Send Toast templates are full snapshots; built-ins renamed "(adhoc)"** (`scripts/window-toast-send.js`): saving a template now always captures every field — title, message, appearance, and target — and applying one stamps them all onto the form; the "Include title and message" checkbox is removed, since text is no longer opt-in. The three built-ins are renamed Information (adhoc), Announcement (adhoc), and Important (adhoc): they are fixed designs that deliberately carry no text, so selecting one clears the title and message for fresh typing — the suffix says what they are for. Remembered preferences pointing at the old "Information" name fall back to the renamed default, and templates saved under the old opt-in keep working — those saved without text simply stamp empty wording like the built-ins do. Recipients remain the one thing a template never saves: who is online is situational and would go stale inside a template, so Quick Toast always sends party-wide and precision targeting stays in the window. Verify live: with text typed in the fields, select an adhoc template — the wording clears; save a template with text, type over it, re-select it — the saved wording returns; the include-text checkbox is gone; reopening the window with a remembered user template restores its wording.

- **Quick Toast menubar item** (`scripts/api-menubar.js`, `scripts/window-toast-send.js`): a new GM-only item in the party menubar's middle zone, next to Send Toast, that opens a context menu of the GM's saved toast templates and fires the picked one with a single click — no window, no form. Only templates with a saved title are listed, because those are the only ones that can send as-is (`show()` requires a title); the adhoc built-ins carry no text and never appear, so the menu is always the GM's own canned announcements ("BIG HIT!", "Take a break", and so on). Each row shows the template's icon, its title and message as the description, and a "(stream)" or "(game + stream)" suffix when the template targets the capture surface. Firing uses the same delivery rules as the window's Send with Entire Party checked — online non-GM users minus the Excluded Users list, on the template's own publish target, with stream targets going out as a broadcast that only `/stream` pages render — and shows the window's small confirmation toast titled with the template name. An empty menu explains how to create a quick toast, the last entry always opens the full Send Toast window, and clicking the item without menu coordinates (the overflow path) falls back to opening the window directly. The send logic lives in `window-toast-send.js` (`getQuickToastTemplates()` / `quickSendToastTemplate()`), dynamically imported by the menubar item like the window itself. Verify live: as GM with a player online, save a template with a title, click Quick Toast, pick it — the player sees the toast and the GM sees "Toast sent: «name»"; a titleless pre-snapshot template is absent from the menu; with no titled templates the menu shows an explanatory disabled row; a stream-targeted template fires with no recipients selected and renders only on `/stream`.

- **Toast content animations** (`scripts/api-toast.js`, `styles/toast.css`, `scripts/window-toast-send.js`, `styles/window-toast-send.css`, `documentation/api/api-toast.md`): `show()` accepts an `animation` config — `'pop'` (content scales in with a springy bounce, text landing a beat after the icon), `'reveal'` (staged entrance: icon, then title, then subtitle rise in), `'pulse'` (a subtle infinite breathe meant for persistent `duration: 0` billboards), `'slam'` (content smashes in from two-and-a-half-times scale like a stamp and jolts on impact), or `'shake'` (rattles side to side with a decaying wobble). Animations are billboard-only by design: `show()` ignores the config without a `size`, keeping the stacked lane still — timers and announcements firing several animated toasts at once would be noise, so the expressive treatment is reserved for the sized takeover (and for stream overlays, where `publish: 'stream'` plus an animation makes an OBS-ready flash card). Implementation is pure CSS keyframes on the content children — never the toast container, so the existing enter/exit transition and its `ANIMATION_MS` sync are untouched and no second JS/CSS timing coupling exists — transform/opacity only, and the whole block sits behind `prefers-reduced-motion: no-preference` so reduced-motion users get instant content. The Send Toast window gained an Animation selector in the Appearance section with a note that it plays on sized toasts only; the choice is part of the template bundle (saved with a template, stamped on apply, and diverging a built-in to Custom like any other appearance edit — the three built-ins carry none) and rides the send payload as plain data. `getActive()` now includes `animation` in its display metadata. Verify live: `api.toast.show({ title: "Hi", size: 'medium', animation: 'pop' })` bounces in, `'reveal'` staggers icon/title/subtitle, `'pulse'` with `duration: 0` breathes until closed, `'slam'` smashes in oversized and jolts on landing, `'shake'` rattles and settles; the same calls without `size` render a normal still toast; with OS reduced-motion on, content appears instantly; in the Send Toast window an animation + size sends to recipients animated, saves into a template, re-applies from it, and picking an animation while a built-in is selected flips the selector to Custom.

- **3-second option in the Send Toast duration list** (`scripts/window-toast-send.js`): the Duration select now offers 3 seconds between Until closed and 10 seconds, for quick flash messages. Verify by picking it in the Send Toast window and confirming the sent toast auto-dismisses after 3 seconds and the choice is remembered on reopen.

- **Toast publish targeting — game vs /stream view** (`scripts/api-toast.js`, `documentation/api/api-toast.md`): Foundry's chat-only `/stream` page — the green-screen chat capture surface typically recorded by OBS — loads modules like the tabletop does, so every toast was also rendering there, on top of the chat capture, with nobody behind the view to dismiss it. `show()` now takes a `publish` config naming the view that renders the toast: `'game'` (the active tabletop, the default), `'stream'`, or `'both'`; invalid values fall back to `'game'`, so all existing toasts stop appearing on the stream view with no consumer changes. The check runs receipt-side against `game.view`, covering every delivery path — direct consumer calls, the timer broadcast relay, and targeted Send Toast sends — and `publish` is plain data, so it rides the cross-client relays unchanged, letting a module deliberately put a toast on the capture surface (e.g. an on-air overlay) by sending `publish: 'stream'`. The stream surface is view-addressed rather than user-addressed: the `showToast` relay handler (`scripts/manager-sockets.js`) renders a stream-targeted payload on any `/stream` client regardless of the `_recipients` user targeting (whoever is logged into the capture page is incidental), and the Excluded Users gate does not apply on the stream view — exclusion protects a passive account from tabletop noise, while publishing to the stream is deliberate. The Send Toast window gained a Target section (Game / Stream / Both select, remembered in the per-user preferences; form order is Recipients, Template, Target, Message, Appearance): Game behaves exactly as before, Both adds the stream surface to the same recipient send, and Stream dims the Recipients section (`styles/window-toast-send.css`), needs no recipients picked, and goes out as a broadcast that only `/stream` pages render; the GM confirmation toast lists "Stream" among the recipients when targeted. The target is part of the template bundle: saving a template captures it (so a canned "BIG HIT!" template can carry Stream with it), applying a template stamps it — templates saved before targets existed stamp Game — and changing the target while a built-in is selected forks the form to Custom, the same divergence rule as the appearance fields; the three built-ins all target Game. Recipients remain outside templates (message text later joined the bundle — see the full-snapshot entry above). Verify live: open `/stream` in a browser alongside a `/game` client; with Target = Game, send a party toast and fire a timer announcement on the Toast channel — both appear on `/game`, nothing on `/stream` (debug mode logs the suppression there); Target = Stream — Recipients dims, sending works with nothing checked, the toast appears only on `/stream` even when the logged-in account is on the Excluded Users list, and the confirmation says "Stream"; Target = Both — selected players' `/game` clients and the `/stream` page both show it; on the stream client's console `api.toast.show({ title: "Hi", publish: 'stream' })` renders while the same call on `/game` does not; chat messages still reach `/stream` unchanged; reopening the window remembers the Target choice; save a template with Target = Stream, switch to Information (Target snaps to Game), re-select the saved template — Target snaps back to Stream and Recipients dims; changing Target while a built-in is selected flips the selector to Custom.

- **Toast Excluded Users setting** (`scripts/settings.js`, `scripts/api-toast.js`, `scripts/window-toast-send.js`, `lang/en.json`): a new world setting in a new Toasts subsection at the top of the Notifications settings — Excluded Users (`toastExcludedUsers`, comma-separated Foundry user names, case-insensitive, default empty) — whose listed users never see toasts on their client, intended for accounts that cannot interact with the screen such as a camera or stream login. Enforcement is receipt-side: `ToastManager.show()` returns null without rendering when the current user is listed (new `isToastExcludedUser()` helper in `api-toast.js`), so a single gate covers every delivery path — direct consumer calls, the internal timer broadcast relay, and targeted sends. The gate applies on the tabletop view only; the `/stream` capture view is exempt, so a deliberately stream-targeted toast (see the publish-targeting entry above) still renders there even when the capture page is logged in through an excluded account. This closes the gap where the Send Toast window's "Entire Party" checkbox resolved at send time to every online non-GM user and so swept in observer accounts that were never selectable in the recipient checkboxes. The Send Toast window additionally filters excluded users out of both its recipient list and its party resolution, so the GM is never offered a recipient who cannot be reached. Verify live: add the camera account's user name to Excluded Users; send a toast with Entire Party checked → every player client shows it except the excluded one, which also no longer appears in the Send Toast recipient list; fire a timer announcement on the Toast channel → same suppression; on the excluded client `api.toast.show({ title: "Hi" })` returns null and renders nothing (the suppression is logged in debug mode); clear the setting → toasts reach the account again without a reload.

## [13.11.0]

### Added

- **Token blood: growing ground pool under tokens that tracks remaining HP (Blood Damage)** (`scripts/manager-token-indicators.js`, `scripts/utility-health.js` new, `scripts/settings.js`, `lang/en.json`, plan at `documentation/plans/plan-token-blood.md`): tokens now show a procedurally generated central pool of blood beneath them from the first point of damage — a new 'hurt' tier (any damage, above 75% health) draws a small pool and a few droplets — growing through the injured/bloodied/critical tiers, ringed by small scattered splats; at 0 HP the pool spreads widest and darkest, well past the token's edge. The splatter field spans three times the token footprint (a 5ft token bleeds over a 15ft area) so the blood reads around the token instead of hiding under the art. The splatter renders in `canvas.primary` via `PrimarySpriteMesh` at sort layer 650 — above tiles and drawings, under every token mesh — and is seeded from the token id so all clients draw the identical pattern with no socket traffic. HP percent and tier classification live in the new shared `utility-health.js` helper (same tier boundaries the combat bar uses; rewiring the combat/party bars onto the helper is deferred). Splatter follows token drags via the existing `refreshToken` sync, mirrors token visibility so hidden or unseen tokens do not leak position, rebuilds on token resize, and is cleaned up on token delete and scene change. Updates trigger only on HP changes (`updateActor`, covering linked actors and unlinked-token deltas) and token refreshes gated by a cached enable flag — no per-frame settings reads or idle work. World settings live in a new Health Indicators section: Blood Damage (`tokenBloodEnabled`, default on) and Token Blood Visibility (`tokenBloodVisibility`, Everyone or GM Only, default Everyone); both apply live via the indicator settings watcher, and the master `generalIndicatorsEnabled` gate also applies. Verify live: damage a linked PC and an unlinked NPC — any damage shows the small 'hurt' pool, then each tier boundary (75/50/25/0%) grows it on all clients; heal → pool recedes, gone at full health; drag → splatter follows; hide the token → players lose it, GM keeps it; Token Blood Visibility GM Only → players never see it; disable Blood Damage or the master indicators setting → all splatter removed live; perf monitor shows no idle cost between hits.

- **Token blood: transient hit bursts (Blood Hit)** (`scripts/manager-token-indicators.js`, `scripts/settings.js`, `lang/en.json`): the moment a token takes damage, a brighter blood burst sprays from it above the token art, holds briefly, and expands/fades out over about a second — per-hit feedback that fires even when the damage does not cross a Blood Damage tier boundary. Burst size and droplet count scale with the hit as a percent of max HP; each burst layers fine 360-degree mist, larger blobs, and arterial streak chains, and every hit draws a unique pattern (seeded from the token's new HP value, so all clients still see the identical burst) with per-hit random rotation, duration, and expansion. Damage detection compares against a last-known-HP cache keyed by actor uuid (so two unlinked tokens of the same base actor track independently), seeded on scene load; healing produces no burst. Bursts respect token visibility and the shared Token Blood Visibility setting, and in-flight animations are cancelled on scene teardown. Gated by the new world setting Blood Hit (`tokenBloodHitEnabled`, default on). A companion Blood Hit Trigger setting (`tokenBloodHitTrigger`, default When Damage Is Applied) can instead fire the burst On a Successful Attack Roll: attack chat cards are classified through the existing `resolveAttackMessage` resolver (`scripts/utility-message-resolution.js`, core dnd5e and MIDI-QOL) on both `createChatMessage` and `updateChatMessage` with per-message dedupe — dnd5e 5.x creates the card first and fills in rolls/target flags via a later update, the same dual-hook pattern `CombatStats._onChatMessage` uses — and each hit target — judged against its AC from the card's target data — bursts at a fixed mid-weight the moment the attack lands, before damage is rolled. Attack mode requires dnd5e attack cards with targeted tokens; damage mode is system-agnostic. A Blood Hit Sound setting (`tokenBloodHitSound`, Blacksmith sound list, default No Sound) plays alongside each burst — locally on each client rather than broadcast, since every client spawns its own burst from the same event, so the sound follows the Token Blood Visibility gating for free. Verify live (damage mode): hit a token for small and large damage → proportionally sized bursts appear and fade; heal → no burst; hits on a hidden token show players nothing. Verify live (attack mode): make a targeted attack that hits → burst on the target with no damage applied; a miss → no burst; switch back to damage mode → bursts follow applied damage again.

- **Blood Cleanup timer** (`scripts/manager-token-indicators.js`, `scripts/settings.js`, `lang/en.json`): a new world-setting slider, Blood Cleanup (`tokenBloodCleanupSeconds`, 0-300 seconds in steps of 5, default 0 = never), removes a token's ground pool that many seconds after its last damage. New damage brings the blood back and restarts the countdown; cleaned-up tokens are suppressed exactly like the Remove All Blood button, so the pool does not redraw from HP state until the token bleeds again. Each client runs its own timer from the same update event. Verify live: set the slider to 10, damage a token → pool appears and vanishes 10 seconds later; damage it again within the window → the countdown restarts; set 0 → pools persist indefinitely.

- **Remove All Blood and Restore All Blood toolbar buttons** (`scripts/manager-toolbar.js`, `scripts/manager-token-indicators.js`, `scripts/settings.js`): two new GM-only tools (`clear-blood`, `restore-blood`) registered with the default toolbar tools, appearing in the Blacksmith toolbar and — while Blood Damage is enabled — in Foundry's native token controls. Each writes a nonce to a hidden world setting (`tokenBloodClearRequest` / `tokenBloodRestoreRequest`); the setting-change relay fires on every client, so all clients act together with no socket code. Remove suppresses cleared tokens — their blood does not redraw from HP state — until they next take damage, which naturally re-blooms them. Restore is the inverse and the only way back short of new damage (suppression deliberately survives rebuilds and scene changes): it lifts all suppression and redraws every token's blood from current HP at the correct tier, restarting cleanup timers; it also resummons pools removed by the Blood Cleanup timer. Verify live: with blood on several tokens and two clients open, click Remove All Blood → splatter clears on both clients and stays gone through canvas pans and token drags; damage a cleared token → its blood returns at the correct tier; click Restore All Blood → every wounded token's pool returns on both clients at its tier, including tokens cleared by the cleanup timer.

## [13.10.3]

### Changed

- **Content-fit toasts now have a 250px minimum width** (`styles/toast.css`): the default no-size toast previously shrank to fit very short titles, which looked undersized; it now keeps a 250px floor while still growing with content up to the existing 420px cap, and the dismiss button uses an auto left margin so it sits at the toast's right edge rather than hugging the text when the floor leaves slack. Billboard sizes (`small`/`medium`/`large`/`fullscreen`) are unaffected — the min-width rule targets only toasts without a size class, and billboards position the dismiss button absolutely. Verify by showing a toast with a one-word title (`api.toast.show({ title: "Hi" })`) and confirming it renders 250px wide with the X at the right edge.

### Fixed

- **Toolbar registration failures are no longer swallowed silently** (`scripts/manager-toolbar.js`, `documentation/architecture/architecture-toolbarmanager.md`): `registerTool` and `unregisterToolbarTool` had empty `catch` blocks, so an unexpected failure returned `false` with no trace. Both now log the error through `postConsoleAndNotification`, naming the tool id, and still return `false`. Log-only behavior change; verification is that the client loads with no errors and toolbar tools register as before.

### Removed

- **Dead code swept ahead of the release** (`scripts/manager-toolbar.js`, `styles/journal-toolbars.css` deleted, `styles/cards-skill-check.css`, `documentation/design-system/design-patterns.md`): deleted the `tokenImageReplacementShowInFoundryToolbar` / `tokenImageReplacementShowInCoffeePubToolbar` watcher branches and setting-wait keys in the toolbar manager — those settings are registered nowhere, so the branches could never fire; deleted `styles/journal-toolbars.css` (52 lines, imported by nothing, none of its classes referenced anywhere in `scripts/` or `templates/`); and deleted the unused `@keyframes cpb-pulse`, which no `animation` declaration referenced. The design-patterns page now lists only `styles/widget-tags.css` as inert (kept deliberately — that feature is unlanded, not dead). Verification: client loads with no console errors, the toolbar still appears once settings register, and skill-check cards render unchanged.

### Added

- **Clear All Targets button in the token toolbar** (`scripts/manager-toolbar.js`, `scripts/settings.js`, `lang/en.json`): a new button injected into Foundry's native token controls directly below the native Select Targets tool. Clicking it clears all of the current user's targeted tokens via `canvas.tokens.setTargets([], {mode: "replace"})` (the v13 targeting API), which also broadcasts the change to other clients. Visible to all users. A new user-scoped setting, Clear All Targets Button (`toolbarShowClearTargets`, default on) in the Foundry Toolbar settings section, hides it; toggling the setting rebuilds the scene controls immediately without a reload. Injection follows the same idempotent pattern as the existing template-control `clear` shim and is applied both in the `getSceneControlButtons` hook and in `refreshSceneControls()`.

## [13.10.2]

### Fixed

- **Importer catalog selectors reject incidental cross-category packs and reliably remember choices** (`scripts/utility-compendium-auto-map.js`, `scripts/window-json-import.js`): Feature mapping no longer promotes equipment, background, or spell packs merely because they contain support Features, and Spell mapping no longer promotes class, ancestry, background, equipment, or monster packs because of isolated rider Spells. Genuinely mixed option/campaign packs and packs whose matching type is their primary content remain eligible. Prompt authoring state now mirrors immediately in memory, saves again when the window closes, and reports client-setting failures instead of silently resetting checkbox selections.

## [13.10.1]

### Added

- **Every Prompt Template now accepts shared Additional Guidance** (`scripts/window-json-import.js`, `scripts/utility-json-import-prompts.js`, importer template and styles): a full-width prompt-only field lets users add story context, preferences, constraints, or generation instructions before copying or saving. The value follows the user while switching importer types during the current Foundry session, is omitted when blank, and is appended behind an explicit boundary that keeps Blacksmith's JSON schema, catalog-name rules, output contract, and validation requirements authoritative. JSON Template output is unchanged, and the shared formatter is reusable by the future importer API.

- **Compendium prompt sections provide Select All and Select None controls** (`scripts/window-json-import.js`, Actor, Journal, and Roll Table prompt registries, importer template and styles): each catalog-compendium group can be toggled independently without affecting world-content or unrelated prompt options, and the resulting choices use the existing remembered authoring state.

- **Actor prompts no longer require unresolved standard actions or placeholder skills** (`prompts/prompt-characters.txt`, `prompts/prompt-character-snapshot.txt`, `scripts/prompt-builder-actors.js`): standard-action references are now catalog-aware, preferring Dash, Disengage, and Ready when available while permitting Grapple and Shove only when those exact documents exist. The starter Actor JSON uses an empty skills object, matching the existing rule to emit only relevant trained or otherwise meaningful skills rather than zero-proficiency padding.

- **Compendium mappings no longer ask GMs to choose a selector count** (`scripts/settings.js`, `scripts/manager-compendiums.js`, `scripts/utility-rolltable-import-lists.js`, `scripts/manager-journal-tools.js`): each mapping automatically renders one priority dropdown for every compatible compendium available from the enabled sources. Any slot may remain None, configured selections compact upward as before, and newly available packs create slots after save/reload. Historical `numCompendiums*` settings remain registered but hidden for compatibility; runtime mapping, the public API, Roll Table catalog helpers, and Journal Tools now derive the effective slot count from detected eligible content.

- **Compendium Mapping adds one-shot automatic initialization and reusable whole-source selection** (`scripts/utility-compendium-auto-map.js` new, `scripts/settings.js`, `scripts/manager-compendiums.js`, localization and Compendiums API docs): a world-level request can classify installed compendiums and replace every ordinary mapping on the next active-GM load. Priority follows four tiers: named official supplements/updated books; official core content in Player’s Handbook, Dungeon Master’s Guide, then Monster Manual order; third-party/imported/homebrew content; bundled SRD content last. A checkbox is generated only for installed Foundry packages/sources containing at least one non-empty Actor, Item, Journal, or Roll Table compendium that Blacksmith matches; macro-only, card-only, playlist-only, adventure-only, and empty packages are omitted. The independent source allowlist constrains auto-map and filters every lower compendium dropdown after save/reload. Each mapping offers only non-empty packs containing compatible content. After writing the normal priority settings, the request clears itself and those user-editable settings remain authoritative. Compendium dropdown labels include detected document counts when their indexes expose them.

- **Character foundations now have dedicated prioritized compendium mappings** (`scripts/compendium-types.js`, `scripts/settings.js`, `scripts/manager-compendiums.js`, Actor prompt/catalog utilities, localization): Species/Races, Backgrounds, Classes, and Subclasses mirror the existing Spell/Feature workflow with a configurable mapping count, ordered Item-pack slots, and optional world-first/world-last lookup. Character prompt generation exposes independent selectors for each mapped foundation type, and Character import resolves each plain name through the same corresponding mapping. Generic Item catalogs remain reserved for equipment and other inventory; for backward compatibility, an unconfigured dedicated foundation mapping still resolves through the legacy generic Item mapping until the GM configures it.

- **Actor prompts now define a safe catalog-gap policy** (`prompts/prompt-characters.txt`, `prompts/prompt-character-snapshot.txt`, `scripts/prompt-builder-actors.js`): supplied catalogs are authoritative for resolvable plain names, so generators may not fabricate near-matches, combine names, or silently omit required progression mechanics. A required Feature missing from the selected catalog must be embedded as a complete friendly Feature with an explanatory GM note; optional content may be omitted. Item catalog text also makes clear that race/species, background, class, and subclass names are verified only when those document types actually appear in the selected Item sources.

- **Actor prompts now include selectable Item, Feature, and Spell catalogs** (`scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`): NPC, Sidekick, and Character Snapshot authoring mirrors Narrative source selection with one checkbox per configured compendium plus optional world content. The Item section includes race/species, backgrounds, classes, subclasses, equipment, tools, consumables, and other building blocks; Features and Spells have dedicated sections. Selected catalogs are appended with exact plain names and useful metadata so Auto generation can choose resolvable content. Actor compendiums are intentionally omitted because constructed Actors reference Items/Features/Spells; Sidekick base-stat-block validation still uses the global Actor mapping.

- **Resolved Character references support equipped, attuned, quantity, and prepared state** (`scripts/manager-compendiums.js`, Character prompt/docs): friendly `{ itemName, itemType, ...state }` wrappers now stay on the exact name-resolution path instead of being misclassified as incomplete custom Item definitions. Blacksmith copies the selected world/compendium document and applies Actor-local `quantity`, `equipped`, `attuned`, and numeric Spell `prepared` values; class reference level overrides continue through the same resolver. Invalid quantities and prepared state on non-Spells fail visibly.

- **Actor prompts now use the single exact standard-action name `Ready`** (`prompts/prompt-characters.txt`, `prompts/prompt-character-snapshot.txt`, `scripts/prompt-builder-actors.js`, Character fixture): removed the nonexistent split references `Ready Action` and `Ready Spell`. NPCs, Sidekicks, spellcasters, and Characters all request the same resolvable `Ready` Feature alongside Dash, Disengage, Grapple, and Shove.

- **Actor Import adds friendly Character Snapshot authoring** (`prompts/prompt-character-snapshot.txt` new, `scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`, `scripts/manager-compendiums.js`): Character prompts use a dedicated non-NPC contract and default race/species, background, class, and subclass preferences to Auto so no build decision is required while composing the prompt. Generated/hand-authored JSON uses exact plain Item names or inline native definitions rather than UUIDs; Blacksmith resolves and embeds them through the existing Item source mapping, supports class/subclass arrays for multiclass snapshots, and assigns the resulting embedded race, background, and original-class IDs. Final character statistics and content remain authoritative; the importer does not apply advancements, make choices, auto-level, or repair builds. Raw native Character exports are rejected until their interconnected IDs can be remapped losslessly.

- **Actor Import prompt fields now explain their behavior through help icons** (`scripts/prompt-builder-actors.js`, `scripts/registry-json-import-journals.js`): every NPC, Sidekick, Character Snapshot, and Actor Portrait field now describes how to use it, what each option changes, what Auto delegates to the generator, and which values Blacksmith records, resolves, or deliberately does not calculate.

- **Sidekick snapshots distinguish narrative identity from their mechanical base and validate supplied math** (`scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`): `sidekick.baseCreature` remains the narrative creature (for example Bulldog), while `sidekick.baseStatBlock` is an exact resolvable Actor name (for example Mastiff); `token.name` is explicitly only a generic display label. Sidekick prompts use the unscaled base stat block CR/XP and matching size Hit Die. Validation warns on level/proficiency, size/Hit-Die, missing base Actor, and base-CR mismatches while preserving all supplied snapshot values.

- **Sidekick import-envelope and Spellcaster mapping are now explicit** (`scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`): prompts explain that root-level `sidekick` is friendly Blacksmith input consumed before `Actor.create()` and normalized to `flags["coffee-pub-blacksmith"].sidekick`; already-native flag placement is accepted too. Spellcaster prompts require `system.attributes.spellcasting` to match `sidekick.spellcastingAbility`, and validation warns when the metadata ability is missing or differs from the sheet field.

- **Named Sidekicks keep their proper token names** (`scripts/prompt-builder-actors.js`): the mechanical `baseStatBlock` is validation metadata and no longer drives `token.name`. Persistent named companions use the root Actor name for the token and default to linked tokens; generic names and unlinked tokens are reserved for intentionally anonymous/reusable Sidekick Actors.

- **Friendly Actor token settings now map explicitly to Foundry v13 prototype tokens** (`scripts/blacksmith.js`): the generated `token` authoring block is merged into `prototypeToken`, explicit prototype values win, and the legacy root key is removed before Actor creation. Linked status, proper name, disposition, vision, bars, dimensions, and texture therefore survive NPC, Sidekick, and Character Snapshot imports reliably.

- **Actor Import accepts static Tasha-style Sidekick snapshots** (`scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`, `scripts/manager-encounter.js`, `scripts/xp-manager.js`, `test-data/import-json/actor-import-sidekick.json` new): Actor authoring now offers a Sidekick profile with Auto (default), Expert, Spellcaster, or Warrior role, plus current level, base creature, and spellcasting ability. Auto requires the generator to infer and emit the actual role instead of silently defaulting the build to Warrior. Imports validate and retain that metadata under Blacksmith flags while creating a standard dnd5e NPC and preserving the fully calculated statistics, inventory, features, and spells supplied by the JSON. Sidekicks are marked as important NPCs for native dnd5e death saves, while Blacksmith's monster encounter and XP calculations ignore their cosmetic CR/XP values. This intentionally does not calculate progression or auto-level sidekicks.


## [13.10.0]

### Added

- **Documentation now publishes to the GitHub wiki automatically** (`.github/workflows/sync-wiki.yml` new, `tools/wiki-sync.mjs` new): every push to `master` touching `documentation/` rebuilds the publish set (the `PUBLISH` list in `tools/wiki-sync.mjs`) and mirrors it to the wiki on GitHub's runners, so the Windows checkout blocker (colon-named wiki pages are illegal on NTFS) no longer applies; held docs are never published regardless of what changed.

- Added shared JSON import preflight and persistent results: Validate performs parse and kind conversion checks without creating documents; imports process batches entry-by-entry and keep the window open with success/error counts, created-document links, issue/report copying, Edit and Retry, Retry Failed (without recreating successes), Open All, and Import Another. Actor post-processing now rolls back the newly created Actor if item embedding fails so a retry does not duplicate a partial Actor.

- Improved the shared JSON importer authoring UI: Roll Table name matching now lives with the applicable Actor, Item, or Document filters; authoring panels are constrained to the window body instead of overflowing beneath the footer; and the header now provides a Journal/Actor/Item/Roll Table importer switcher that preserves each importer's saved choices.

- **Toast system: appearance parameters, billboards, true persistence, and a GM "Send Toast" tool** (`scripts/api-toast.js`, `styles/toast.css`, `scripts/manager-sockets.js`, `scripts/window-toast-send.js` new, `styles/window-toast-send.css` new + `@import` in `default.css`, `scripts/api-menubar.js`, `scripts/settings.js`, both toast docs): the toast primitive shipped in 13.9.3 as a bare local renderer; this release gives it a full appearance surface and a GM-facing tool built on it. **The API takes parameters, not a closed style set** — an early iteration used whitelisted semantic styles (`info`/`success`/…) and was replaced before release, because presets belong in the consumer. `show()` now accepts `color` and `backgroundColor` (both strict-hex validated; the accent drives border, icon, and title via the `--blacksmith-toast-accent` custom property, while the background is independent and rendered at alpha 0.9 so the play area reads through), `backgroundImage` (aspect-preserving `cover` with an automatic dark scrim for legibility; the path is `encodeURI`d so it cannot escape the `url("")` wrapper), `sound` (a path played locally on arrival), and `size`. Those three color/image values are the *only* inline-style exceptions to the class-only model, each sanitized at the boundary; everything else stays class-mapped. **Display is binary**: no `size` renders a **toast** (content-fit, stacks top-center, bounded by `MAX_STACK`); `small` | `medium` | `large` | `fullscreen` render a **billboard** — a viewport-proportional box in *both* dimensions (≈26×18 / 40×28 / 58×42 percent, tuned per preset rather than one shared percent so ultrawide monitors don't produce shapeless boxes; fullscreen is 100×100 with a scrim and no border), centered on screen with clamped viewport-unit typography so content scales relationally with the box and long messages scroll inside it rather than growing it. Billboards are singletons (a new one replaces the current), exempt from the stack cap, and — with no `onClick` — dismiss on a click anywhere (a real dismissal, so `onDismiss` fires). They render inside a fixed full-viewport layer whose positioning is **inline and JS-owned**: a billboard appended as a plain `<body>` child under a stale stylesheet becomes a static block in Foundry's layout and physically shoves the interface around (observed live during development), so broken CSS can now only degrade a billboard to unstyled. **Persistence became real**: `duration: 0` toasts no longer count toward `MAX_STACK` and are never evicted — previously five subsequent transient toasts would silently evict a "persistent" announcement; only the ×, a `stackKey` replacement, or programmatic removal ends them. The shared border is 3px solid, and `getActive()` reports `persistent`/`color`/`backgroundColor`/`size`. **The GM tool**: a GM-only **Send Toast** button on the party menubar opens a 500px, height-resizable window built on the shared window vocabulary (banner header, `blacksmith-window-section` cards, `blacksmith-field` labeled controls) with three sections — Recipients (per-player checkboxes with avatars, offline users shown disabled, plus an **Entire Party** master that resolves to all active players at send time), Message (title + 3-row textarea), and Appearance (template selector, size, duration, sound with a local preview button, icon palette, border and background colors in the pin-configuration hex+swatch pattern, and an optional background image with browse/clear). The icon palette's first tile is **Custom image**, which reveals the avatar-path field and hides it again on any icon choice — image and icon are mutually exclusive by construction rather than by precedence. **Templates** are the preset layer, selected at the top of the window above the message: three built-ins forming an escalation ladder (Information — content-fit, 10s, auto-dismisses; Announcement — small billboard, 30s; Important — fullscreen, until clicked) plus user templates saved by name in the world-scoped `toastSendTemplates` setting. Built-ins behave as read-only presets and a GM's own templates as documents: editing an appearance field while a built-in is selected forks the form to Custom, while editing one of your own keeps the edits attached so Save updates it in place without prompting — only Custom asks for a name, and built-ins show no Save at all (the button's tooltip names which it will do). Delete appears only for a GM's own templates. Saving updates the selector in place rather than re-rendering the window, so wording typed before saving survives. A template always carries the look and never the recipients; the wording is opt-in through an **Include title and message** checkbox, so a GM can save a fully canned toast ("Session break — back in 15") or just a style. The built-ins deliberately carry no text, and typing a title or message never flips the selector to the **— Custom —** sentinel — writing the message *is* the normal use of a template, not a divergence from it. Any appearance edit does flip it, so the selector never claims a template the form no longer matches. Recipients, colors, sizes, sounds, icons, and the include-text choice persist per client between sessions, while the title and message deliberately start blank on every open. Delivery rides a new **internal** targeted relay, `sendToastToUsers(config, userIds)`: targeting is receipt-side per the socket privacy rule (`_recipients` on the payload; the `showToast` handler renders only on listed clients; content is non-secret by contract). Like `broadcastToast`, this is Blacksmith-private plumbing — the public cross-client `send({recipients})` API remains gated on the socket rewrite. The sending GM gets a brief confirmation toast naming the recipients, which reads its look from the Information template so the tool's own voice follows the house default. Verify live (two clients): each built-in template stamps the form and the sent toast matches; save a template with Include title and message checked, switch away and back, and the wording returns with it; save one without it and the wording is left alone; typing a message keeps the template selected while changing a color flips to Custom; saved templates persist across a reopen and are deletable while built-ins are not; a `duration: 0` toast survives six transients and still closes on ×; each billboard size centers correctly and fullscreen closes on any click with a second replacing the first; a background image keeps its text readable; the sound preview plays locally without broadcasting; a targeted send renders only on the chosen player's client while the other sees nothing; Send Toast is absent from the party bar for players.

- **All JSON importers now remember each user's authoring choices** (`scripts/settings.js`, `scripts/window-json-import.js`): Actor, Item, Journal, and Roll Table windows persist the selected type/profile, Template Only vs Template + Instructions mode, structured fields, and checkboxes in one hidden client setting keyed by importer. Changes save immediately and again before Copy/Save, while Journal campaign geography and other shared world defaults retain their existing storage. An importer audit also confirmed that Item and Actor options reach their builders, Journal selected compendium/world catalogs have no secondary inclusion gate, and Roll Table selected sources now always reach both Text and Document prompts.

- **Roll Table Import now models Foundry v13's two result types correctly** (`scripts/registry-json-import-rolltables.js`, `scripts/utility-rolltable-import-lists.js`, `scripts/parsers/parse-rolltable.js`, `scripts/manager-compendiums.js`, Compendium API, shared importer window/template/style, Roll Table prompts, importer architecture/API docs): the type selector is now only **Text** or **Document**. World and independently selected compendiums are source controls rather than fake result types; Actor/Item filters plus generic document catalogs narrow what is supplied to prompts and human guides. Friendly Document JSON contains an exact plain-text name, document category, and optional source id—not a UUID. During import Blacksmith's centralized exact name-to-UUID resolver converts that data into Foundry's `documentCollection`/`documentId`, with selected-source scoping and explicit error or Text-fallback policy. Text tables may optionally use the same catalogs as unlinked source material. Clean/guided templates also cover result count, replacement, displayed formula, weighting, duplicates, and images; invalid weights, ranges, overlaps, and obsolete result types fail visibly. The shared catalog query remains reusable by the planned Utility tab/API.
  - Text adds an explicit **Use catalog entries** policy: **Exact Names** (default) copies catalog names verbatim without links, **Inspiration Only** permits original/embellished prose, and **Do Not Include Catalog** omits catalog data. The prompt explicitly separates unlinked storage from content fidelity so generators no longer rename every catalog entry merely because the result type is Text.

- **Modern Journal profiles now support clean and guided manual JSON authoring** (`scripts/registry-json-import-journals.js`, shared importer window/template): Journal JSON Template offers Area Narrative and Location Narrative only; Illustration remains Prompt-only and legacy Encounter/Injury are deliberately excluded. Area templates prefill campaign geography/images and use schema controls for Rewards plus optional Encounter/Conversations blocks; creative direction and additional context remain Prompt-only. Location templates prefill their folder, journal, geography, title, and image fields. Both profiles provide plain-text human guides that reinforce their distinct schemas and importer constraints.

- **Item JSON Template now offers clean or guided output with a real schema option** (`scripts/registry-json-import-items.js`, shared importer window): every Item profile supports Template Only and Template + Instructions in plain text. The guide explains common types, profile-specific authoring, validation, Artificer selection, and native-JSON escape hatches. Weapon/Equipment add an **Include Passive Effects** schema control that consistently adds/omits `passiveEffects` in manual JSON and adds the corresponding authoritative instruction to the AI prompt; creative and image controls remain Prompt-only.

- **Actor Import now supports clean and human-guided manual JSON authoring** (`scripts/prompt-builder-actors.js`, `scripts/blacksmith.js`, shared importer window): Actor's JSON Template tab is enabled for NPC/Monster and offers **Template Only** or **Template + Instructions**. Template Only is directly parseable neutral NPC JSON; the guided plain-text output explains abilities, skills (`prc` vs `per`), content arrays, standard actions, tokens, biography, references, and validation without requiring AI. The shared window now accepts a dedicated authoring-guide builder while keeping Copy and `.txt` Save As delivery.

- **Shared importer window now has three authoring-neutral tabs in the agreed order** (`scripts/window-json-import.js`, `templates/window-json-import-body.hbs`): Import JSON is the default first tab, followed by JSON Template and Prompt Template. Each authoring tab directly selects its own builder instead of sharing an Output dropdown; JSON Template is capability-gated until a kind supplies a template builder. Copy and Save As remain the delivery actions, and saved templates/prompts use portable plain-text `.txt` files. Existing kind/profile selectors and pre-build options are preserved as the foundation for guided templates and structured import results.

- **Importer architecture and proposed public API contracts documented before the UI/API rebuild** (`documentation/architecture/architecture-importer.md`, `documentation/api/api-importer.md` new): the JSON schema and validation pipeline are established as Blacksmith's authoring-method-neutral contract, with human-guided templates and AI prompts as optional adapters. The target three-tab workflow (Import JSON, JSON Template, Prompt Template), schema/creative/import option scopes, plain-text Copy/Save delivery, validation and creation stages, persistent post-import results, retry/import-another behavior, capability discovery, structured entry results, errors/warnings, destinations, permissions, and versioning are now recorded. The API is explicitly marked proposed until exposed on `module.api`.

- **Actor and Item prompt generation now expose domain-specific, API-ready direction controls** (`scripts/prompt-builder-actors.js` new, `scripts/blacksmith.js`, `scripts/registry-json-import-items.js`, Actor/Item prompts): Actor prompts accept purpose, rules posture, detail, inventory, feature-suite, and spellcasting policies; Item prompts accept purpose, power posture, complexity, lore depth, and automation policy. Both builders validate structured values and append authoritative directives, creating the same future external-tool seam introduced for Area Narratives.

- **Portrait Image moved from Journal Import to Actor Import** (`scripts/blacksmith.js`, `scripts/registry-json-import-journals.js`, `prompts/prompt-characters.txt`, `prompts/prompt-journal-core.txt`): Actor Import now offers NPC/Monster and Portrait Image templates, with the existing portrait facets attached to the latter. Journal Import retains Illustration Image for scenes. The NPC prompt is now JSON-only and no longer simultaneously requires image generation and forbids it.

- **Area Narrative prompt generation now has strong, API-ready direction controls** (`scripts/registry-json-import-journals.js`, `scripts/window-json-import.js`, `templates/window-json-import-body.hbs`, `styles/window-json-import.css`, `prompts/prompt-journal-profile-area.txt`): before copying a prompt, GMs can select scene emphasis (Auto/Exploration/Social/Combat/Mixed), content handling (Expand Freely/Preserve Supplied Facts/Catalog Content Only), detail level, and Auto/Include/Omit policies for encounters, conversations, and rewards. These are validated structured options on the exported `buildJournalImportPrompt()` composition path—not UI-only prose—so future Blacksmith APIs and external tools can request the same authoritative prompt parts while Blacksmith retains schema, catalog, and import ownership.

- **Friendly Weapon import now creates complete modern dnd5e weapons** (`prompts/prompt-item-profile-weapon.txt`, `scripts/registry-json-import-items.js`, `scripts/parsers/parse-item.js`, `test-data/import-json/item-import-weapon.json` new): Weapon JSON can define simple/martial melee and ranged weapons, natural/improvised/siege weapons, base and versatile damage, ability and attack bonuses, magical enhancement, proficiency, mastery, weapon properties, ammunition, and normal/long/reach ranges. Blacksmith validates incompatible or incomplete combinations and creates the standard dnd5e Attack activity automatically with base weapon damage enabled. Weapons also share Equipment's safe equipped/equipped-and-attuned passive-effect contract, including image inheritance and native suppression while unavailable.

- **NPC prompt now produces complete action bars and believable carried inventory** (`prompts/prompt-characters.txt`): every NPC receives the standard action references, including the shared Ready action, while every gear-capable NPC receives a lean role-appropriate kit beyond signature weapons/armor. The rule strongly defaults to useful carried gear without padding random loot and explicitly exempts creatures that cannot plausibly carry equipment, such as ordinary beasts, oozes, incorporeal spirits, most constructs, and summons. Existing compendium content remains exact-name references; custom gear may use friendly or native inline definitions.

- **Friendly Equipment passive effects — safe Phase 1** (`prompts/prompt-item-core.txt`, `prompts/prompt-item-profile-equipment.txt`, `scripts/registry-json-import-items.js`, `scripts/parsers/parse-item.js`, `test-data/import-json/item-import-equipment-passive.json` new): Equipment JSON may add `passiveEffects` reminder/status effects with activation `equipped` or `equippedAndAttuned`. They become transferred Item Active Effects; dnd5e 5.2.5 natively suppresses them while unequipped and, for required-attunement gear, while unattuned. Blank effect images inherit the Item image. This phase deliberately requires `changes: []`; contextual mechanics stay in the effect description, while exact automation uses native Item JSON until safe change keys are designed. Invalid activation, status shape, non-empty changes, and inconsistent equipped-and-attuned configuration fail visibly.

- **Item prompt image generation is now opt-in** (`prompts/prompt-item-core.txt`, `prompts/prompt-item-partial-image-request.txt` new, `scripts/registry-json-import-items.js`): Item Import adds an unchecked **Include Image Generation Request** option beside Artificer Item. Unchecked Full Prompts request JSON only and omit all image-generation instructions; checked prompts append the square item-portrait workflow. The option is available whether or not Artificer is installed and does not alter JSON-only hand-authoring output.

- **Friendly Feature/Spell activities now carry range, duration, targets/areas, and linked Active Effects** (`scripts/parsers/parse-item.js`, `prompts/prompt-item-core.txt`, Feature/Spell profiles, `scripts/registry-json-import-items.js`, `test-data/import-json/item-import-feature-save-area.json` new): each activity may define `activityDuration`, `activityRange`, and `activityTarget` (individual target plus measured-template shape/dimensions/prompt), replacing the previous hard-coded Instantaneous / Self / no target. `appliedEffects` creates embedded Active Effect documents and links them to the activity, including standard statuses, durations, changes, module flags, and Save `onSave` behavior; unusual removal triggers remain prose. Feature `featureProperties` now maps dnd5e properties such as `mgc` and `trait`. The prompt explicitly recommends multiple activities when one Feature has multiple executable mechanical branches (for example full grapple vs latch-only by target size), while leaving cosmetic-only tiers in prose. Static fixture verification: a Save feature converts to Self range, 15-foot circle, creature targeting, one-minute activity duration, Recharge 5–6, and a linked 60-second Charmed effect whose ID matches the Item effect document. Live verification: import the area-save fixture, confirm the activity sheet fields and Applied Effect dropdown, activate it from an Actor, place the 15-foot template, fail a save, and apply Charmed from the resulting workflow/card.

- **Item prompt delivery now offers Full Prompt or clean JSON Template for both Copy and Save As** (`scripts/window-json-import.js`, `templates/window-json-import-body.hbs`, `styles/window-json-import.css`, `scripts/registry-json-import.js`, `scripts/registry-json-import-items.js`): the shared import window accepts an optional JSON-template builder and, when a kind provides one, shows an **Output** selector beside the type selector. Item Import provides it for all eight profiles. **Full Prompt** preserves today's composed core + profile + optional Artificer instructions; **JSON Template** returns valid, indented, prose-free starter JSON with neutral values and the selected type's fields (including Feature/Spell additions). **Copy** places the selected format on the clipboard; **Save As…** writes `*-full-prompt.txt` or `*-json-template.json` with the appropriate MIME type. The active Artificer checkbox is honored by both builders: JSON-only output includes a valid `flags["coffee-pub-artificer"]` starter block, while unchecked output omits it. Other registered import kinds remain unchanged until they provide their own JSON-only builder; the selector is capability-gated and hidden for them. Live verification: for each Item type, select both Output values and exercise Copy + Save As; parse every JSON Template, confirm the filename/extension, and repeat with Artificer checked to verify its flag block.

- **Feature and Spell are first-class friendly Item Import types** (`scripts/registry-json-import-items.js`, `scripts/parsers/parse-item.js`, `prompts/prompt-item-core.txt`, `prompts/prompt-item-profile-feature.txt` new, `prompts/prompt-item-profile-spell.txt` new, `prompts/prompt-characters.txt`, `test-data/import-json/item-import-feature.json` new, `test-data/import-json/item-import-spell.json` new): the Item Directory Import dropdown now includes **Feature** and **Spell**, each composing the shared core prompt with a dedicated type profile. Their JSON stays author/AI-friendly (`itemName`, `itemType`, type-specific fields, and a small activity contract) while Blacksmith converts it to dnd5e 5.2.5 Item types `feat`/`spell`, including description/source/identifier, feature category and requirements, spell level/school/preparation/components/materials/casting time/range/duration/target, item/activity uses and recovery, effects/flags, and typed Attack, Damage, Heal, Save, or Utility activities. Friendly Feature/Spell objects work unchanged inside NPC `features`/`spells` arrays through the shared parser. Unsupported activity labels, invalid spell levels/schools/preparation states, missing Save abilities, invalid feature categories, and recovery periods now throw explicit import errors rather than falling back to Loot. Static fixture conversion verified a monster Utility feature, a level-2 conjuration Save spell with spellcasting DC and `3d6` radiant damage, and rejection of level 10; live verification: Item Directory → Import each new fixture/profile and exercise its activity from a sheet, then embed the same objects in an NPC import and exercise them there.

- **General native Item JSON ingestion and inline custom NPC content — item-import expansion Phase 1** (`scripts/parsers/parse-item.js`, `scripts/manager-compendiums.js`, `prompts/prompt-item-core.txt`, `prompts/prompt-characters.txt`): Item Directory import now accepts either Blacksmith's existing flat item schema or a native Foundry Item object identified by top-level `name`, `type`, and `system`; native data is cloned losslessly (system fields, activities, effects, flags, images) while root identity/placement metadata (`_id`, `folder`, `ownership`, `_stats`, `pack`) is stripped before creating the new document. NPC `items`, `spells`, and `features` arrays may now mix existing plain-name references with inline native Item definitions; Blacksmith-flat definitions remain supported for physical entries in `items`. References still resolve through the configured world/compendium order, while definitions are parsed and embedded directly. Unresolved references and invalid inline definitions now produce a visible warning naming everything omitted instead of hiding only in debug logs. The prompts document the union format and require native `spell`/`feat` types for custom content. Static verification: native sanitization preserves nested data and the mixed-list branches keep lightweight `{name, type?}` references on the resolver path; live verification: Item Directory → import an exported spell/feature and compare system data, activities, effects, and flags; Actor Directory → import an NPC mixing an official name, inline feature, inline spell, and deliberately missing name, then confirm the first three embed and the missing reference is warned.

### Fixed

- **Feature compendium mapping no longer treats implementation-support packs as authoring catalogs** (`scripts/utility-compendium-auto-map.js`): dnd5e stores feats, class/species/monster features, actions, and automation child documents under the same root `feat` Item type. Blacksmith still offers primary Feat, Feature, and Action packs, but suppresses clearly labeled support packs such as Feature Items, Feat Features, Item Features, Spell Features, Summon Features, and embedded-macro samples. The rule is based on pack purpose rather than a package-specific blacklist, and whole-source exclusion remains available.

- **Compendium source selectors now separate source identity from catalog evidence** (`scripts/utility-compendium-auto-map.js`, `scripts/settings.js`): checkbox titles contain only the package/source name. Their description shows the number of eligible compendiums plus aggregate document counts by useful category—Actors, character foundations, Features/Feats, Spells, physical Item types, Journals, and Roll Tables—so GMs can judge a source before enabling it.

- **Item mapping now means a compendium of inventory, not any Item pack with incidental gear** (`scripts/utility-compendium-auto-map.js`): Background, Class/Subclass, Feature/Feat, Spell, Species/Origin, Monster, Action/Summon, and Bastion/Facility packs no longer enter the generic Item selector merely because they contain a helper weapon, container, or consumable. Explicit inventory packs remain eligible; ambiguously named mixed packs qualify only when physical inventory is their majority content.

- **Scene mapping now selects sources instead of organizational Scene packs** (`scripts/utility-compendium-auto-map.js`, `scripts/settings.js`, `scripts/manager-compendiums.js`): one choice such as Burden of Knowledge represents all of that enabled source's non-empty Scene compendiums, with the choice label showing aggregate compendium and Scene counts. Runtime and the public Compendiums API still receive concrete ordered pack ids. Existing per-pack Scene selections are interpreted as their owning source for backward compatibility.

- **Automatic compendium mapping is now an explicit one-shot initializer** (`scripts/settings.js`, `scripts/manager-compendiums.js`, localization): the control sits below its independent source allowlist as **Auto-map Compendiums on Next Load**. On the next active-GM load it replaces every ordinary priority mapping using enabled sources and the documented tier rules, clears itself, and confirms completion. Generated mappings are then fully manual and remain authoritative; Blacksmith no longer maintains a competing automatic runtime map.

- **World-owned packs and utility Journal storage are classified accurately** (`scripts/utility-compendium-auto-map.js`, `scripts/compendium-types.js`): compendiums declared by the current world are grouped under a distinct `World: <title>` source instead of being mislabeled with the world id or conflated with a same-id module. Journal compendiums clearly labeled as preset, cache, configuration, or internal data storage are excluded from importer mappings and source eligibility; this is a generic purpose rule, not an integration-specific exception.

- **Auto-map tiering now uses authoritative owning-package identity** (`scripts/utility-compendium-auto-map.js`): Blacksmith resolves module titles from `game.modules`, the active system title from `game.system`, and the current world title instead of relying on sparse per-pack metadata. Package ids and titles are normalized across hyphens, punctuation, and apostrophes before classification, so the Player's Handbook, Dungeon Master's Guide, and Monster Manual modules occupy their intended Tier 2 order ahead of generic system content and campaign/homebrew sources. Pack labels cannot promote third-party content merely by mentioning an official book.

- **Mapping dropdowns use human package titles and declared source metadata** (`scripts/compendium-types.js`, `scripts/settings.js`, `scripts/utility-compendium-auto-map.js`): options now read like `D&D Player's Handbook: Actors — …` instead of exposing package ids or repeating `Actors:` inside the Actors section. SRD tier detection reads the pack's generic `sourceBook` declaration (including the owning package manifest fallback), so bundled packs such as Actors and Starter Heroes correctly sort with SRD content even when their labels omit “SRD.”

- **Compendium priorities restack on GM load** (`scripts/settings.js`, `scripts/blacksmith.js`): every mapping preserves the relative order of configured choices while compacting them into priorities 1–N and moving all `None` entries to the bottom. This startup pass guarantees a clean list even if a prior settings-window change or reload interrupted the immediate reorder handler.

- **Journal Tools now resolves links through the central Compendiums API manager** (`scripts/manager-journal-tools.js`): Actor-first/Item-second detection, exact-name matching, colon-name fallback, configured world-first/world-last stages, source filtering, and priority ordering are preserved without reading raw `*CompendiumN` settings or hand-building compendium UUIDs. Journal linking now follows the same restacked mappings and source eligibility as JSON import and public API consumers.

- **Importer authoring groups are first-class Blacksmith sections with responsive catalog columns** (`templates/window-json-import-body.hbs`, `styles/window-json-import.css`, `scripts/window-json-import.js`): Select Template, every structured field group, each compendium catalog, World Content, and Journal-specific block are sibling `blacksmith-window-section` elements using the shared section body/header contract—there are no imitation nested cards. Unstacked catalogs use equal-width responsive grid columns while intentionally stacked groups remain vertical. Section-aware visibility hides the complete section when its template/field conditions have no visible controls, and the authoring scroll panel measures every sibling section through the bottom of its content.

- **`createJournalEntry()` now returns the journal entry instead of `undefined`** (`scripts/utility-common.js`, `documentation/api/api-create-journal-entry.md`): all three builders (`AREA`, `ENCOUNTER`, `LOCATION`) awaited `JournalEntry.create()` and discarded the result, so `const e = await api.createJournalEntry(d)` gave no handle and `e.sheet.render()` threw a `TypeError` far from the cause. Each path now returns. The existing-entry branches — which update a same-named journal in place rather than duplicating it — return **that** entry, so the resolved value is always a handle to the journal the data now lives in, whether or not this call created it. How to verify (live): import an AREA, an ENCOUNTER, and a LOCATION journal and confirm each returns an entry you can call `.sheet.render(true)` on; re-import the same payload and confirm it returns the existing entry rather than creating a duplicate.

- **`setToolbarSettings()` accepted any `displayStyle` and corrupted the setting** (`scripts/manager-toolbar.js`, `documentation/api/api-toolbar.md`): the value was written straight to `game.settings.set` with no check against the registered choices, so `setToolbarSettings({ displayStyle: 'labelz' })` stored an invalid value in a user-scope setting. It is now validated against `none` / `dividers` / `labels`; an unrecognized value is logged and ignored. How to verify (live): call `api.setToolbarSettings({ displayStyle: 'labelz' })` from the console and confirm a warning appears and the toolbar setting is unchanged, then pass `'labels'` and confirm it applies.

- **`tags.seedRegistry()` silently did nothing on player clients** (`scripts/manager-tags.js`): an `isGM` guard returned early with no warning, so a player-client first-run seed never happened. The guard was unnecessary — the write goes through `_writeRegistry`, which already proxies to the GM for non-GM clients, exactly as every other registry mutation does. Removed. How to verify (live): from a player client, call `api.tags.seedRegistry('my.ctx', [['alpha','beta']])` and confirm the tags appear in `api.tags.getRegistry()` on both the player and GM clients.

- **Round duration under-reported intermittently: two subsystems shared one combat flag and disagreed about what a field meant** (`scripts/timer-round.js`, `scripts/manager-combatbar.js`, `scripts/stats-combat.js`): `stats-combat` writes the `stats` flag wholesale from its in-memory `currentStats`, which has no `accumulatedTime` — so every write silently discarded the round timer's banked time. Worse, both subsystems kept a `roundStartTimestamp` and meant different things by it: for `stats-combat` the wall-clock start of the round (used for `roundDuration`), for the round timer the start of the current active session, reset whenever the GM's window regains focus. One key could not hold both meanings, so merging was not a fix. Round timing now lives on its own `roundTimer` flag (`{ startedAt, accumulatedTime }`) owned solely by `timer-round.js`; `stats` belongs outright to `stats-combat.js`. `manager-combatbar.js` no longer reads combat flags for this and calls the new public `RoundTimer.getCurrentRoundDuration()` instead, so there is one owner and one calculation. `_getRoundTiming()` falls back to the legacy `stats` fields when the new flag is absent, so combats already in progress keep their elapsed time — that fallback is transitional and should be removed a release from now. How to verify (live): start a combat, let a round run, alt-tab away and back to fire the blur/focus handlers, then advance the round — the combat bar's round duration should reflect real elapsed time including the time spent unfocused, and total combat duration should accumulate correctly across rounds; reload mid-combat to confirm the legacy fallback path still reports elapsed time for a combat started before the update.

- **Removed twelve dead module-unload listeners that had never executed** (`blacksmith.js`, `manager-canvas.js`, `manager-combatbar.js`, `manager-journal-dom.js`, `manager-latency-checker.js`, `manager-navigation.js`, `manager-pins.js`, `manager-token-indicators.js`, `timer-combat.js`, `timer-planning.js`, `timer-round.js`, `ui-combat-tracker.js`): ten `unloadModule` registrations plus a `closeGame` pair. Neither is a Foundry hook — verified against v13 core with a working control — so none of this cleanup had ever run, while reading as though teardown were handled. Foundry reloads the world when a module is enabled or disabled, which tears everything down anyway, so no teardown is needed. Follow-on dead code went with them: `manager-combatbar`'s `registerCombatCleanupHook()` method and its call site existed only to register the hook; `manager-latency-checker`'s `#unloadModuleHookId` field and the `unloadModule` option threaded through `cleanupChecker(options)` had no remaining caller, so `cleanupChecker()` is now a no-arg method. `EncounterToolbar.dispose()` and `JournalPagePins.dispose()` are kept but are now documented as uncalled in `architecture-blacksmith.md` §9B.2 — they are correct implementations awaiting a real teardown trigger. How to verify (live): load a world and confirm a clean startup with no console errors, then exercise canvas tools, token indicators, pins (confirm the tag registry still seeds), and the combat bar — the four subsystems whose `ready` blocks were touched.

- **Tag taxonomy had three different readers, so a documented `register()` call silently produced an empty taxonomy** (`scripts/manager-tags.js`, `documentation/api/api-tags.md`): the `tag-taxonomy.json` loader read `entry.flags`, the `pin-taxonomy.json` compat path read `entry.tags` (strings only, no `{key, protected}` objects), and runtime `register()` read `taxonomy.tags`. A consumer copying the documented example — which used `flags:` — got an empty taxonomy back with no warning, because runtime `register()` was looking for `tags:`. All three now share one `_normalizeTagList()` helper that accepts either `tags` or `flags` and handles both string and object entries, so no caller can be silently wrong; `pin-taxonomy.json` additionally gains object-entry support it never had. `api-tags.md` now documents `tags` as the canonical key (heading corrected from `flags.register` to `tags.register`) and states that `flags` remains accepted for the shipped JSON. How to verify (live): call `api.tags.register('my.ctx', { label: 'X', tags: [{ key: 'a', protected: true }, 'b'] })` then `api.tags.getChoices('my.ctx')` and confirm both entries return with `a` protected; repeat with `flags:` instead of `tags:` and confirm the identical result; confirm the shipped `tag-taxonomy.json` contexts still populate their chips in the Configure Pin tag row.

- **Area prompt breadcrumb prefill contradicted its own schema by appending scenetitle** (`scripts/registry-json-import-journals.js`): the shared location-path helper now stops at realm > region > site > area, matching the envelope and Area profile rules. Scene ordering labels remain only in scenetitle and are no longer duplicated into generated Prompt or JSON Template breadcrumbs.

- **Planning timer crashed with "not a registered game setting" when a world loads with an active combat** (`scripts/timer-planning.js`): reported from play on 13.9.4 — `Error: "coffee-pub-blacksmith.planningTimerEndingSoonThreshold" is not a registered game setting` thrown from the countdown tick. The setting is registered; the bug is ordering: settings register in a `ready` callback, but the 13.9.2 countdown self-heal recreates the tick from `renderCombatTracker`, which can fire *before* that callback during a world load with an active combat — so the tick's raw `game.settings.get` calls ran against an empty registry (the §3 init/ready trap, one interval deep). All reads reachable from the tick and expiry paths now use `getSettingSafely` with their registered defaults: `planningTimerEndingSoonThreshold` (20), `planningTimerEndingSoonSound`/`planningTimerExpiredSound` ('none', both call sites), `planningTimerEndingSoonMessage`, `planningTimerLabel` ('Planning', both call sites), and `getTimerVolume`'s `timerSoundVolume` (0.5). Worst-case behavior in the pre-ready window is now a tick using defaults instead of a thrown interval. Verify live: load a world that has an active combat with a running planning timer → no settings error in console during load and the timer resumes ticking; warning threshold, sounds, and expiry still behave normally mid-session.

- **Legacy physical Item conversion dropped price and Magical status and stored invalid attunement labels** (`scripts/parsers/parse-item.js`): prices such as `"50 GP"` now convert to dnd5e's `{value: 50, denomination: "gp"}` model instead of being cleaned to zero; physical Item properties now use the dnd5e `mgc` set value instead of obsolete property objects; and friendly attunement labels normalize to `""`, `"required"`, or `"optional"`. Unsupported price and attunement strings fail visibly rather than importing corrupted values. Magical property conversion is consistent across the legacy Loot, Consumable, Container, Equipment, Tool, Weapon, and fallback branches.

- **`ITEMIMAGENUANCE` was documented but absent from generated Item JSON** (`prompts/prompt-item-core.txt`, `scripts/registry-json-import-items.js`): both Full Prompt and JSON Template output now include `itemImageNuance`; it supplies optional visual direction when image generation is requested and remains harmless import metadata otherwise.

- **NPC prompt template emitted `token.lockRotation` twice** (`prompts/prompt-characters.txt`): removed the duplicate trailing key so generated Actor JSON obeys the prompt's own no-duplicate-key rule instead of relying on parsers to silently retain the last value.

- **NPC AI could reintroduce `per` as Wisdom despite the corrected Perception template** (`prompts/prompt-characters.txt`): the common-skill list now labels `prc` as Perception/Wisdom and `per` as Persuasion/Charisma, explicitly forbids using `per` for Perception, and tells generators not to emit unused zero-proficiency skill placeholders. This closes the ambiguity that let an otherwise corrected NPC payload add `per` back with the wrong ability.

- **Generated linked effects all used the same generic aura icon** (`scripts/parsers/parse-item.js`, `prompts/prompt-item-core.txt`): an `appliedEffects[].img` left blank now inherits the activity icon when supplied, then the imported Item's selected or guessed image, and uses `icons/svg/aura.svg` only as the final fallback. Explicit effect image paths remain authoritative.

- **Spell JSON Template used numeric strings while activity targeting used numbers** (`prompts/prompt-item-profile-spell.txt`, `scripts/registry-json-import-items.js`, `test-data/import-json/item-import-spell.json`): friendly `spellTarget.affectsCount` and `templateSize` examples now use numbers when populated and `null` when unused, matching `activityTarget` authoring. The converter remains backward-compatible with previously generated numeric strings.

- **Item AI targeting output is now explicit and strictly typed** (`prompts/prompt-item-core.txt`, `prompts/prompt-item-profile-feature.txt`, `scripts/parsers/parse-item.js`): instructions choose area shape from the complete mechanic (including facing/direction) and require `choice`, `contiguous`, and `prompt` to be JSON booleans. The importer rejects string and empty-string values for those fields instead of silently coercing them, so malformed generated JSON fails clearly before creating an inaccurately configured activity.

- **Journal Tools entity linking could corrupt pages when applying multiple changes — replacements now apply back-to-front with an overlap guard, and the world fallback searches the right collection** (`scripts/manager-journal-tools.js`): a code review of the entity-linking pipeline (prompted by the author questioning whether the tool "does what we want") found that all four scanners record character offsets into the *original* page content, while the processing loop mutates `pageContent` after each replacement without recomputing anything — so on any page needing two or more changes, later replacements sliced at stale offsets and could splice links into unrelated text or mangle the page HTML. And this path has been **live**, reachable all along via the tool's Foundry-toolbar button. Two surgical changes defuse it without waiting for the planned rebuild: unique entities are now **sorted by descending offset before processing** (replacing from the end of the page toward the front keeps every remaining entity's offsets valid — the mechanism the existing-links scanner already used for itself but that broke when the four scan lists were merged), and entities whose range **overlaps an already-replaced range** (e.g. a link inside an `<li>` that was just rewritten) are skipped with a logged "Overlaps Prior Change" instead of slicing into freshly written content. Separately, the not-found-in-compendiums world fallback read the wrong variable (`foundEntityType`, always null at that point, instead of the requested `entityType`) — so a failed *item* lookup fell back to searching **actors**, linking any item that shares a name with an actor to the actor; it now searches the collection matching the requested type ('both' tries actors then items), and derives the found type from which collection matched rather than from document `.type` (which is the subtype — `'npc'`, `'weapon'` — and never `'Item'`, so world finds were also always mislabeled as actors in the run report). The scanning heuristics themselves (keyword-based section detection, generous plain-text acceptance) are untouched — the tool may still *miss* or imperfectly target candidates, but what it writes is now well-formed; the full DOMParser + `api.compendiums.resolveMany` rebuild remains tracked in `TODO.md`/the refactor plan. Verify live: on a test journal page with several plain entity names in a bullet list, run entity replacement → every created link lands on its own name, surrounding text and HTML structure intact (compare page source before/after); a page needing exactly one change behaves as before; an item name that also exists as a world actor links to the item.

- **Journal Tools' journal-sheet entry point was dead on v13 — restored as an entry in the sheet's "⋯" controls menu** (`scripts/manager-journal-tools.js`): the contextual tools icon on journal windows (entity replacement — upgrading plain actor/item names in journal text to compendium/world links — plus search & replace) rode `renderJournalSheet`/`renderJournalPageSheet`, which are the **v12 class-name hooks**; v13's ApplicationV2 journal sheet is `JournalEntrySheet`, whose render fires `renderJournalEntrySheet`, so neither registration has fired since the v13 move and the titlebar icon silently ceased to exist. (The tool itself stayed reachable and in use via its Foundry-toolbar button, which opens the same window — only the contextual jump-off from an open journal was lost.) (The injection also targeted v1 header anatomy — `.header-button.close` — which v13 replaced with `button.header-control` and the "⋯" controls dropdown.) Discovered during the `settingChange` verification: the resurrected settings hook re-rendered the sheet on toggle, revealing that no icon appeared — two independent dead layers over one feature. Per the author's call, the fix adopts the native v13 mechanism rather than re-injecting DOM: a `getHeaderControlsJournalEntrySheet` hook pushes a "Journal Tools" entry (feather icon) into the "⋯" menu, with `visible` re-evaluating `enableJournalTools` on every render — so toggling the setting shows/hides the entry live via the settings-change re-render, no reload. Header-control clicks dispatch to `app.options.actions[action]` (verified in core `application.mjs`), so the handler installs alongside the entry in the same hook. The four dead v12 methods (`_onRenderJournalSheet`, `_isEditMode`, `_addToolsIcon`, the html-based `_openToolsDialog`) are deleted in favor of a direct `_openToolsForApp(app)`; the `.journal-tools-icon` CSS stays, as the tools window's entity-replacement partial reuses the class. One deliberate behavior change: the menu entry remains available while editing a page (the old icon hid in edit view) — the tools window operates on the document, so this is safe. This also establishes the AppV2 header-controls pattern the GM Notes roadmap calls for. Verify live: open a journal → "⋯" shows Journal Tools; clicking opens the tools window for that journal; toggling the setting hides/shows the entry on the open sheet without reload; an entity-replacement scan still runs end-to-end.

- **Ten dead `settingChange` registrations rewired to hooks that exist — settings-cache invalidation, combat bar, token indicators, toolbar, journal tools, encounter toolbar, sidebar pin/style/combat all react to setting changes again** (`scripts/manager-hooks.js`, `scripts/blacksmith.js`, `scripts/api-menubar.js`, `scripts/manager-combatbar.js`, `scripts/manager-journal-tools.js`, `scripts/manager-token-indicators.js`, `scripts/manager-toolbar.js`, `scripts/ui-journal-encounter.js`, `scripts/ui-sidebar-pin.js`, `scripts/ui-sidebar-style.js`, `scripts/sidebar-combat.js`): Foundry has no hook named `settingChange` (established in 13.9.4 when the leader toast exposed it), so every one of these callbacks had **never executed once**. The rewire is per-site opt-in through a new explicit helper — `HookManager.registerSettingChangeCallback()` — not a blanket remap: the helper registers `updateSetting` + `createSetting` (world- and user-scoped settings arrive as Setting documents on every client) plus `clientSettingChanged` (client-scoped, changing client only) and normalizes all three to the old `(namespace, key, value)` callback shape, so each site's body is unchanged. Two core v13.351 facts are baked in: **`scope: 'user'` settings are world-stored Setting documents** broadcast to all clients (core `ClientSettings#setWorld` stamps `setting.user`), so the helper filters user-scoped events to the owning client — without this, one player resizing their combat bar would resize everyone's; and a document's `setting.value` is already cast to the registered type, so the helper never re-parses. Activating never-run code needed three safety changes found by review: the settings-cache callback's compendium *reorder* branch is now GM-gated (`reorderCompendiumsForType` writes world settings; the callback now fires on player clients, which must not attempt world writes — the cache clear and array rebuilds still run everywhere); the journal-tools callback was modernized to re-render AppV2 journal sheets via `foundry.applications.instances` (its old body only scanned legacy `ui.windows`, which holds no v13 journal sheets); and `sidebar-combat.js` got hand-rolled `updateSetting`/`createSetting` listeners matching its standalone no-HookManager style. Known interplay to watch: the toolbar's leader refresh now fires from both the setting document and the legacy `blacksmith.leaderChanged` socket (debounced render, expected harmless); the audit also found `manager-toolbar.js` watching two settings that are registered nowhere (`tokenImageReplacementShowIn*Toolbar`) — those branches remain inert and are tracked in `TODO.md`. **Live-verified 2026-07-18** across the ten-site matrix (kept in `TODO.md`): cache/compendium sync with a clean player console, session timer, leader (no flicker from the doubled path), scene styles applying without reload, combat-bar user-scope isolation, token indicators, journal-tools re-render, and the sidebar pin/style/manual-rolls trio. Two sites apply only via their `requiresReload` reload (`sidebarCombatChatEnabled` tab injection, `requestRollShowInFoundryToolbar` scene-controls button) — expected, flags kept. The round also exposed two pre-existing bugs now tracked in `TODO.md`: the Journal Tools icon never renders on v13 AppV2 sheets (legacy header injection never migrated to the "⋯" controls menu), and Request Roll has no true master off-switch; plus a follow-up audit to drop now-redundant `requiresReload` flags where live handlers fully apply.

- **Pins: choosing "Rectangle" in Configure Pin silently never saved — `update()` dropped the shape** (`scripts/manager-pins.js`): `_applyPatch`'s shape whitelist accepted `circle`/`square`/`none` but omitted `rectangle`, so the patch was discarded with no error. Rectangle is fully supported everywhere else — schema validation (`pins-schema.js:386`), the renderer, the Configure Pin UI, and the free-aspect sizing logic — and `create()` accepted it; only `update()` dropped it, and Configure Pin saves through `update()`, which made the bug user-visible: pick Rectangle, save, reopen, and the pin is back to its old shape. One word added to the whitelist. **Design note (author, 2026-07-18): rectangle is deliberately the image-only shape** — with a FontAwesome icon it is forced square (identical to Square); with an image URL the pin takes the image's natural aspect ratio with the rounded-corner border, which neither Square (crops 1:1) nor None (no border) provides. Verifying it live surfaced a rendering bug the dead save path had been hiding (`scripts/pins-renderer.js`, `styles/pins.css`): the container's corner radius came from CSS `border-radius: 15%`, and a percentage radius resolves against width horizontally but *height* vertically — so non-square pins rendered skewed **elliptical** corners while the inner image was already correctly clipped to a px radius from the short side, and the two disagreed visibly. The renderer now pins the container to the same px radius (`min(width, height) × the CSS variable`, recomputed in the existing zoom-aware update alongside the border width), so outer border and inner image agree and corners stay circular 90° arcs at any aspect and zoom; square pins are unchanged by construction (short side = both sides). **Fully live-verified 2026-07-18**: save round-trip, image-aspect rendering, and circular corners after the radius fix all confirmed in a real scene.

- **Pins: `list()` included filter-hidden pins by default — the documented default was inverted** (`scripts/manager-pins.js`): `_matchesListFilters` checked `options.includeHiddenByFilter === false`, so *omitting* the flag — the call `api-pins.md` teaches (`pins.list({ moduleId })`) — included pins hidden by client visibility filters, the opposite of the documented default. It hid because every internal caller passes an explicit boolean (verified by grep across the pins manager, renderer, and both pin windows), so only external API callers ever hit the default path — the un-dogfooded-API pattern from the audit yet again. Now `!== true`: omitted means excluded, per the contract; internal behavior is unchanged by construction. **Live-verified 2026-07-18**: with filter-hidden pins on a scene, `api.pins.list({ sceneId })` returned 2 while `{ includeHiddenByFilter: true }` returned 4, and the pin-layers window's counts and filter summaries were unchanged.

- **XP Distribution defaulted the whole party to included after combat — non-participants now open unchecked, and the results card labels them "No Combat"** (`scripts/xp-manager.js`, `templates/window-xp.hbs`, `templates/cards-xp.hbs`, `styles/cards-xp.css`): when a combat ended, every party member opened with the inclusion toggle active, so XP split across the full party regardless of who actually fought. Two independent halves guaranteed it: `calculateXpData` sourced players from `loadPartyMembers()` (whole party, all `included: true`) and never consulted `combat.combatants` — a `getCombatPlayers()` helper exists for exactly this and has **zero call sites** (the two-entry-point mismatch flagged in the `architecture-xp.md` audit) — and the template hardcoded `class="inclusion-toggle active"`, ignoring `player.included`, so even correct data would have rendered checked. The design intent stands: the **whole party stays listed** — only the *default* changes, so the GM can still toggle a latecomer in. `calculateXpData` now marks each member `included` by membership in the combat's player-owned combatants, and `partySize` — which drives both the party-size multiplier and the per-player split — counts only included players, so the header numbers match the toggles the window opens with. The template renders `active`/`dimmed` and the per-row totals from `included` (matching what `_updateXpDisplay` writes on toggle, so first render and first interaction agree). `autoDistributeXp` previously force-reset everyone to `included: true` before applying; it now preserves the participation defaults and gives excluded players `finalXp: 0`, which `applyXpToPlayersFromData` already skips. The manual menubar path (`openXpDistributionWindow`, no combat) is deliberately unchanged — whole party, everyone included. On the results chat card, excluded players previously showed a "0 XP" award like everyone else; `applyXpToPlayersFromData` now tags their result rows (`excluded`, from `player.included === false`) and the card prints an italic muted **"No Combat"** instead — an *included* player who nets 0 XP through adjustments still reads "0 XP", so the two cases stay distinguishable. **Live-verified 2026-07-18** (window toggles, header math, and distribution amounts confirmed in a real combat end); still to check on the next distribution: the card's "No Combat" label renders for excluded members.

- **"Hide Initiative Roll Cards" never hid anything — a Foundry v13 core bug strips the flag the detection relied on** (`scripts/blacksmith.js`): with `combatTrackerHideInitiativeRoll` enabled, initiative cards still appeared, because the `renderChatMessageHTML` callback detected them via `message.flags.core.initiativeRoll` — a flag that **does not exist on any v13 initiative message**. Proven against core v13.351 source: `Combat#rollInitiative` writes the marker as a nested dotted key (`flags: {"core.initiativeRoll": true}`, `combat.mjs:411`), nothing in the creation pipeline expands it (`mergeObject` only expands *top-level* dotted keys; `Roll#toMessage`'s merge sees none; DataModel construction never expands), and `DocumentFlagsField` then validates flag keys as package IDs — a dot fails — and `TypedObjectField._cleanType` **silently deletes** the key. dnd5e 5.2.5 adds no flag of its own (`Combat5e#rollInitiative` just calls `super`), so the fallback `flags.dnd5e.roll.type === 'initiative'` check never matched either: the feature had never fired once. Detection now lives in `_isInitiativeRollMessage()`, layered for resilience: the flag checks stay (they cover other roll paths, and auto-recover the moment any Foundry version restores the flag — `renderChatMessageHTML` is confirmed present in v14) with a fallback that matches `message.flavor` against a regex built at runtime from the same `COMBAT.RollsInitiative` i18n string core formats the flavor with (localization-safe; requires the message to carry rolls; template split on `{name}` with regex-escaping — pattern builder exercised against en/fr/ja templates including regex metacharacters). Known limit: in a mixed-language world the flavor is baked in the roll creator's language, so differently-set clients won't match — the creator's client (which can delete the message) still will; this evaporates when core fixes the flag. Activating the path also surfaced a latent DSN bug the dead code hid: the delete step waited on `Hooks.once('diceSoNiceRollComplete', …)`, which pairs with whichever animation finishes *first* — a group NPC roll creates several messages at once and would have deleted them all mid-animation. Each render now registers a listener filtered to its own `message.id` (with a 15s fallback for rolls DSN never animates, e.g. per-user DSN settings). Note the auto-roll interplay: the player and NPC-at-add auto-roll paths use `Combatant#rollInitiative`, which core implements with **no chat message at all** — only tracker rolls and the round-change NPC re-roll (`combat.rollInitiative`) produce cards for this feature to suppress. Verify live: enable the setting; roll initiative from the tracker (single combatant, and "roll all NPCs" as a group) and from a player's sheet with GM + player clients open → no card appears on either client and the messages are absent from `game.messages`; with Dice So Nice active, every combatant's dice finish animating before deletion; disable the setting → cards post normally. On a future v14 upgrade, spot-check `game.messages.contents.at(-1).flags` after one initiative roll — `core.initiativeRoll` present means the core bug is fixed and the flag path is carrying detection again.

- **Feature prompt duplicated `recoveryPeriod`, and Recharge actions could only become Recharge 6** (`prompts/prompt-item-core.txt`, `prompts/prompt-item-profile-feature.txt`, `prompts/prompt-item-profile-spell.txt`, `scripts/parsers/parse-item.js`, Feature/Spell fixtures): the physical core key is now unambiguously `itemRecoveryPeriod`; Feature item-level fields are `featureUsesMax`, `featureUsesSpent`, `featureRecoveryPeriod`, and `featureRecoveryFormula`; activity recharge adds `activityRecoveryFormula`. The converter keeps the original names as input aliases for compatibility, maps the core consumable recovery through the real dnd5e period keys, and writes an explicit Recharge threshold (`"6"` = 6, `"5"` = 5–6) instead of relying on dnd5e's default 6. Both profiles now state that physical rarity/weight/price/magic/attunement/use fields are ignored for non-physical Feature/Spell Items. Verified by conversion: a Feature Save activity with `activityUsesMax: 1`, Recharge, and formula `"5"` stores `{period: "recharge", type: "recoverAll", formula: "5"}`; legacy Feature recovery keys still parse.

- **NPC import prompt used Persuasion's `per` key for a Wisdom-based Perception entry** (`prompts/prompt-characters.txt`): the generated Actor template now uses dnd5e's `prc` key for Perception, and the common-skill list includes both `prc` (Perception) and `per` (Persuasion) exactly once. The skill examples also document the current dnd5e proficiency multipliers (`0`, `0.5`, `1`, `2`) instead of suggesting the invalid `value: 4`, so generated proficiency and Expertise values calculate correctly. Verified against the installed dnd5e 5.2.5 `CONFIG.DND5E.skills` and `CONFIG.DND5E.proficiencyLevels` definitions; live verification: open Actor Directory → Import → copy the NPC prompt, generate/import an NPC with Perception proficiency or Expertise, and confirm its Perception and passive Perception values while Persuasion remains Charisma-based.


## [13.9.4]

### Added

- **Timer notifications routed through the Notifications channels — session, planning, and combat** (`scripts/timer-notifications.js` new, `scripts/api-toast.js`, `scripts/manager-sockets.js`, `scripts/timer-planning.js`, `scripts/timer-combat.js`, `scripts/api-menubar.js`, `scripts/settings.js`, `lang/en.json`): three new channel settings — `notifySessionTimer`, `notifyPlanningTimer`, `notifyCombatTimer` (toast / chat / both / none, **default toast**) — decide *where* timer announcements go; each timer's own settings section still decides *which* message kinds fire at all (pause, warning, expiry toggles are untouched and gate the calls upstream). All three timers already funneled every announcement through a single helper (`sendTimerMessage` for session in `api-menubar.js`, `sendChatMessage` in each timer file), so routing is one call at the top of each: the shared `routeTimerNotification()` (`timer-notifications.js`) shows/broadcasts the toast half and returns whether the caller should still post its chat card. The transport problem this required solving: timer helpers run on the **GM client** and the chat card used to be how players found out — so the toast half uses a new **internal** relay, `broadcastToast()` in `api-toast.js` (shows locally, pushes data-only toast configs to every other client over the existing socketlib channel via a `showToast` handler in `manager-sockets.js`). Deliberately *not* part of the public toast API — the public cross-client `send({recipients})` remains gated on the socket rewrite; this is Blacksmith-private plumbing, callbacks stripped by construction. Toast content is mapped from the flags the helpers already receive (set/start/warning/expiring-soon/expired/pause/resume), titled `«label» Timer` from each timer's configured label, one `stackKey` per timer so rapid updates replace rather than stack. In `timer-combat.js` the `{name}` combatant substitution moved above the routing so both halves get the substituted text. **Redundant `ui.notifications` banners removed** now that the channel owns announcements: both `timerAdjusted` socket receivers ("timer set to X" on players), the planning warning + two "Has Ended" banners, and the combat critical-warning + expired banners. The combat **auto-advance** banner ("next up {name}") stays — nothing else carries that notice. The Notifications section is organized into **H2 subsections** — Leader, Movement, Session Timer, Planning Timer, Combat Timer — each holding its channel dropdown plus the *which-kinds-fire* checkboxes, which moved here from the timer sections (same setting keys, so stored world values carry over): `timerChatPlanningStart`, `timerChatPlanningRunningOut`, `timerChatTurnStart`, `combatTimerCriticalEnabled`, `timerChatTurnEnded`, and the marching-order checkbox under Movement. Everything else (labels, sounds, thresholds, message text, durations) stays in each timer's own section. Two planning gates changed while wiring this: `timerChatPlanningRunningOut` was a **dead setting** — registered but never read; the warning actually rode the legacy `timerShowNotifications` master — and is now the real threshold-message gate (default flipped to `true` to preserve the effective prior behavior); the ended message previously sent unconditionally and is now gated by the **new** `timerChatPlanningEnded` (default `true`). Planning's `shouldShowNotification()` became fully unused after this and was deleted; combat's version (which also carries the per-combatant override list) still stands. The shared `timerChatPauseUnpause` checkbox was **split into two** so each timer's subsection is self-contained: `timerChatPlanningPause` and `timerChatTurnPause` (both default off, matching the old default; the old key is retired and its stored value does not carry over — a GM who had pause/resume messages enabled re-enables them per timer). All notification settings are world-scoped — the GM decides for the table. Verify: with defaults, set/start/pause/resume/warn/expire each timer → toasts on GM and player clients, no chat cards, no banners; *Chat Only* → cards as before, no toasts; *None* → silence; the settings sheet shows Notifications with five H2 subsections and the checkboxes in place (and gone from the timer sections); unchecking planning's threshold or ended box suppresses that kind on every channel; combat expiry with auto-advance still shows the auto-advance banner.

- **"Notifications" settings section — per-feature delivery channel (toast / chat / both / none), and the movement-change toast** (`scripts/settings.js`, `lang/en.json`, `scripts/api-menubar.js`, `scripts/token-movement.js`): a new top-level **Notifications** section in module settings holds one world-scoped choice per migrated feature: `notifyLeaderChange` and `notifyMovementChange`, each **Toast Only / Chat Only / Toast and Chat / None**, both defaulting to **Toast Only** — the standing default for every future migration unless a feature deliberately chooses otherwise. **This is a behavior change: the leader chat cards (public + whisper) and the movement-change chat card no longer post by default** — set the channel to *Chat Only* or *Toast and Chat* to restore them. Movement got its toast in the same stroke: `movementType` is a world setting, so `token-movement.js` registers the same `updateSetting`/`createSetting` receipt-side pattern as the leader toast (`stackKey: "blacksmith-movement"`, movement icon + description; the inline movement catalog was hoisted out of `MovementConfig.getData()` into a module-level `MOVEMENT_TYPES` shared by both). Gating lives at both ends: the toast half is checked receipt-side in each hook, the chat half GM-side at the `ChatMessage.create` site; the leader-change sound still plays for any mode except *None*. The movement-change announcement now covers **every** movement type uniformly — historically the chat card was skipped for Conga/Fastest Path (they only posted a marching order); the announce is hoisted above that branch in `_handleMovementChange` so Conga and Fastest Path toast/card like everything else. The marching-order card is its own concern with its own checkbox: **Show Marching Order in Chat** (`notifyMarchingOrder`, Boolean, default on), gated once at the top of `postMarchingOrder()` so it covers both the initial post and change reposts. The combat auto-switch transitions (combat start → Combat mode, combat end → previous mode restored, both in `token-movement.js`) write `movementType` too, so they toast on every client; their previously-unconditional chat cards are now gated by the same `notifyMovementChange` channel. The redundant Foundry banner (`ui.notifications.info("Movement type changed to: …")` in the `movementChange` socket handler, `manager-sockets.js`) is removed outright — announcements are owned by the channel setting; the handler now only syncs the menubar UI. Warning/error banners (movement locked, no leader set, move denied, etc.) are untouched — those are feedback, not announcements. The settings groundwork adds `WORKFLOW_GROUPS.NOTIFICATIONS`, a shared `NOTIFICATION_CHANNEL_CHOICES`, and localized labels/hints. Verify: with defaults, changing leader or movement toasts on every client with no chat card; *Chat Only* posts the card with no toast; *Both* does both; *None* does neither and suppresses the leader sound; switching to Conga announces via the channel like any other type, and the marching-order card follows its own checkbox (on → posts as before, off → never posts, including change reposts).

- **On-screen toast primitive — `api.toast` (Phase 1 of the player-facing toast system)** (`scripts/api-toast.js`, `styles/toast.css`, `scripts/blacksmith.js`, `scripts/api-menubar.js`): a transient toast that pops up over the play area, top-center stack — `toast.show({ title, subtitle, icon, image, duration, onClick, onDismiss, stackKey, moduleId })`, plus `remove`, `clearByModule`, `getActive`. Deliberately **local and per-client**: the cross-client part of "toast a player" has always already happened by the time anything renders (Bibliosoph's splash draws after its message arrived on its own transport; the leader toast draws after the `partyLeader` setting synced), so the primitive ships without waiting on the socket rewrite — a `send({recipients})` layer comes later as a thin wrapper. The design generalizes Bibliosoph's homegrown message splash, the suite's one real prior art: `image` renders a round avatar (not just a FontAwesome icon), title + subtitle two-line layout, and `stackKey` gives replace-in-place ("latest state wins") while keyless toasts stack, capped with silent oldest-eviction. `onClick` makes the toast clickable (pointer + hover affordance, same button sound as menubar clicks; handler runs, toast removed) and `onDismiss` follows the **same dismiss contract as menubar notifications** — timeout and × only, never post-click, programmatic, bulk, replacement, or eviction. Rendering is DOM-direct (`createElement`/`textContent` — consumer strings never parsed as HTML; no template, no re-render, no fingerprint to keep honest), which is why there is no `update()`: toasts are immutable, `stackKey` covers that use case. Dogfood consumer: `_registerLeaderChangeHook` listens to the core `updateSetting`/`createSetting` document hooks for the `partyLeader` world setting (which fire on every client) and toasts receipt-side — "You are now the party leader" on the leader's client, the actor's name elsewhere — alongside the existing leader chat cards (replacing that chat noise is a later, separate step). New docs: `documentation/api/api-toast.md` and `documentation/architecture/architecture-toast.md`; `styles/toast.css` is `@import`ed from `default.css`. Verified by console on two clients (`api.toast.show({...})` variants: stacking, stackKey replacement, actionable click vs ×, dismiss-callback matrix); the leader dogfood is verified under the `settingChange` fix below.

### Fixed

- **The menubar's party-leader hook listened to a Foundry hook that does not exist — and it is not alone** (`scripts/api-menubar.js`): the leader-change callback (menubar refresh + the new leader toast) was registered against `settingChange`, and live testing showed the toast never firing. Verified against Foundry v13.351 core source: **nothing ever fires a hook named `settingChange`** — core fires `clientSettingChanged` for client-scoped settings (changing client only) and the standard `updateSetting`/`createSetting` *document* hooks for world-scoped settings (all clients). The leader *display* had always appeared to sync anyway because `setNewLeader` broadcasts over socketlib (`updateLeader`), which masked the dead registration. `_registerLeaderChangeHook` now registers `updateSetting` + `createSetting` (the latter covers the first-ever leader set in a world) and filters on `setting.key === "coffee-pub-blacksmith.partyLeader"`. A second trap surfaced in live testing: the schema declares `value` as a `JSONField` (a JSON string), but the *client* Setting document re-casts it on initialize (`Setting#_initialize` → `_castType()`), so for this `type: Object` setting `setting.value` is **already the parsed object** — the first fix's `JSON.parse(setting.value)` threw on every fire, the callback's own catch swallowed it, and it fell through to the "leader cleared" branch, still toastless. The callback now uses the value as-is and parses only if it arrives as a string. The wider fallout — roughly ten more never-fired `settingChange` registrations across nine files (settings-cache invalidation, combat bar, token indicators, toolbar, journal tools, sidebar pin/style, and a raw `Hooks.on` in `sidebar-combat.js`) — is documented in `architecture-blacksmith.md` §9B.2 and tracked as a High-priority audit in `TODO.md`; they are deliberately **not** blanket-fixed here, because the correct replacement hook depends on each setting's scope and those callbacks have never once executed. Verify: change the leader with two clients open — both clients toast (leader's says "You are now the party leader", the other names the actor); chat cards unaffected.


## [13.9.3]

### Added

- **Actionable menubar notifications** (`scripts/api-menubar.js`, `templates/menubar.hbs`, `styles/menubar.css`): `addNotification()` was display-only — "Alicia sent you a message" showed, auto-dismissed, and there was nothing to click. It now takes an optional fifth `options` argument: `onClick` makes the notification clickable (pointer cursor + hover affordance; the handler runs, then the notification is removed), `onDismiss` fires only when the notification goes away *unacted-on* — auto-timeout or the × button, never after `onClick`, never on programmatic `removeNotification()`, and never from the bulk clears (which bypass `removeNotification` and delete straight from the Map) — and `pulse: true` animates the icon for "You have 5 unread messages"-style alerts. `updateNotification()` accepts the same keys, including `null` to strip a handler. Storing callbacks is safe by construction: notifications live in a per-client Map and never cross the socket. Two traps handled along the way: the structure fingerprint (`_computeMenubarStructureFingerprint`) hashed only id/text/icon, so toggling `onClick`/`pulse` via `updateNotification` would have silently skipped the rebuild and the affordance would never appear — the actionable and pulse bits are now part of the fingerprint; and Handlebars can't read functions, so `renderMenubar()` maps notifications to plain display objects carrying `actionable`/`pulse` booleans instead of handing the template the live objects. The × close branch stays ahead of the body-click branch in the delegated handler, so closing never fires `onClick`. An actionable click plays the same button sound as toolbar and secondary-bar clicks; the × stays silent, as it always has. The strip is also ordered now — it previously rendered in Map insertion order, which in a right-aligned strip put the *newest* notification rightmost: display order is temporary notifications left of persistent ones, newest first within each group, and the fingerprint's notification parts are no longer sorted (order is semantic — a reorder, e.g. `updateNotification` flipping a duration between temp and persistent, must force a rebuild). Display-only notifications are unchanged. Driving consumer: Bibliosoph's unread-message alerts. Documented in `api-menubar.md` (including the dismiss-semantics table) and the `api-core.md` quick example. Verified by console: an `onClick` notification shows the pointer affordance, clicking runs the handler and removes it without firing `onDismiss`; the × and auto-timeout fire `onDismiss` and not `onClick`; `updateNotification(id, {onClick})` on a plain notification makes it clickable (exercises the fingerprint fix); a plain `addNotification("display only")` behaves exactly as before.

### Fixed

- **Party/leader votes no longer require tokens on the canvas, and use each player's *assigned* character** (`scripts/manager-vote.js`): starting a vote gated eligibility on `getUsersWithOwnedTokenOnCanvas()`, so with no tokens placed it errored with "no eligible voters" and refused to open. Eligibility is now simply logged-in (active) non-GM players. Separately, `_getUserCharacter` returned the *first owned* character (`userCharacters[0]`), so a player owning several got an arbitrary one; it now returns `user.character` — the character assigned in User Configuration. So a player assigned Favia while also owning Cyrus is shown as Favia.

- **Planning timer no longer freezes in combat (shows the time but never counts down) until manually paused and restarted** (`scripts/timer-planning.js`): the countdown interval was created only inside `startTimer`, gated behind `verifyTimerConditions()` — which returns false until every combatant has initiative — while the start was spread across several racing paths (the `renderCombatTracker` hook via `_restoreFreshPlanningTimerForCurrentCombat`, the deferred `_tryStartWhenPlanningReady`, and `handleCombatUpdate`). Under that race the timer could end up **active, unpaused, and with no live interval** — displayed but never ticking. `resumeTimer` was the only start path without the gate, which is exactly why pause+resume was the workaround. The three byte-identical interval blocks (`startTimer` / `resumeTimer` / `setTime`) are now a single `_beginCountdown()` helper, and `_onRenderCombatTracker` self-heals: when the state says running but the GM has no live interval and conditions pass, it recreates the tick. Because the tracker re-renders frequently during combat, a dropped interval now self-corrects within a render cycle. Verified in live combat, including across a round transition.


## [13.9.2]

### Fixed

- **Volume constants resolved to an id string, not a number — every documented `playSound` call passed `NaN`** (`scripts/asset-lookup.js`): `generateConstants()` did `const value = item.path || item.id`. Volume entries carry `path: ''` and `value: '0.5'`, so the `||` fell through to the id and **`BlacksmithConstants.SOUNDVOLUMENORMAL` evaluated to the string `"volume-normal"`**. `api-core.md` teaches `utils.playSound(SOUNDNOTIFICATION01, SOUNDVOLUMENORMAL)` in two places; that reached `clamp("volume-normal", 0, 1)` → `Math.max(0, NaN)` → **`NaN`** → `AudioHelper.play({volume: NaN})`, silently, with no throw and no log. Background-image constants were corrupted the same way — `BACKBRICK` returned the `.webp` path instead of the CSS class `brick`. The doc was the correct spec throughout. **The rule is per-collection and is not derivable from `item.type`** (banners and backgroundImages are both `type: 'image'` and resolve differently), nor by falling back through the fields (141 of 171 constants carry *both* a `path` and a `value`). `AssetLookup` now carries an explicit `CONSTANT_SOURCE_FIELD` map — `path` for sounds/banners, `value` for volumes/icons/backgrounds — with the reasoning attached. Why it survived: Blacksmith passes numeric literals to `playSound` and never used these constants itself.

- **The Shield icon was unreachable as a constant — the doc was right and the *data* was broken** (`resources/asset-defaults/assets-icons.json`): `api-core.md` documented `BlacksmithConstants.ICONSHIELD`. It resolved to `undefined`, and the obvious conclusion — that the doc had invented it — was wrong. The icon is real and complete in every other respect (`id: 'icon-shield'`, `value: 'fa-shield'`, tags, type), but its **`constantname` field was missing entirely**. `generateConstants()` gates on `if (item.constantname)`, so the entry was **silently skipped**: no constant, no warning. A sweep of every asset record under `resources/` found this was the **only** one of **183** missing a `constantname` — an omission, not a decision. Restored `"constantname": "ICONSHIELD"`; `BlacksmithConstants.ICONSHIELD` now resolves to `fa-shield` and the repo-wide count of unreachable-by-constant assets is **0**.

- **`registerToolbarTool` accepted tools with no `onClick`, installing a dead button and returning `true`** (`scripts/manager-toolbar.js`): `api-toolbar.md` has always specified `onClick` as **required** and promised "Missing required properties: Returns `false` and logs error". Nothing enforced it — `registerTool` validated `toolId` and `toolData` and stopped there. A tool registered without `onClick` was stored, reported success, rendered a button, and did nothing when clicked; the consumer's only signal was silence, arriving far from the registration that caused it. Now rejected with a log. Safe by construction: `_wireToolClicks` already skips any tool whose `onClick` isn't a function, so such a tool was **already** a dead button — this only makes an already-broken registration say so. All five internal tools define `onClick`.

- **`getToolsByModule()` returned tools that could not be unregistered** (`scripts/manager-toolbar.js`): the registry is keyed by `toolId`, and `unregisterToolbarTool` looks up by `toolId` — but the stored object carried only `name`, never the key itself. `api-toolbar.md` told consumers to unregister via `tool.name`, which worked *only* because `name` defaults to `toolId`. Pass an explicit `name` ≠ `toolId` — which the doc explicitly permits — and unregister silently returned `false`, leaving the tool permanently unremovable **with no supported way to recover its id**. `toolId` is now stored on the tool object (assigned after the `...toolData` spread, so a caller can't clobber the registry key). The menubar registry got this same fix in 13.9.x; the toolbar was missed.

- **Hook context tracking was inert — every hook reported as `default`** (`scripts/manager-hooks.js`): `registerHook`'s `callbackRecord` omitted the `context` field. Three consumers read `callback.context` (`blacksmith-api.js:791`, `:846`, `:863`), all got `undefined`, so `BlacksmithAPIHookStats()`'s `hooksByContext` collapsed into a single `{ default: [...everything] }` bucket — a plausible-looking object, useless for the one thing it exists for. A developer chasing a context-cleanup leak reached for the tool and was told every hook lived in `default`. `context` was tracked correctly in the separate `contexts` map for cleanup; it was simply never written onto the record. One field; the doc described the intended design correctly throughout.

- **`SkillCheckDialog` ignored `options.title` for the window frame** (`scripts/window-skillcheck.js`): the constructor did `options.title = data.title` — the **ApplicationV1** key. ApplicationV2 reads the frame title from `options.window.title` (core: `get title() { return game.i18n.localize(this.options.window.title); }`), so `DEFAULT_OPTIONS.window.title = 'Request a Roll'` always won. Every module passing `title: 'Spot the trap'` got a window captioned "Request a Roll". Leftover from the V1→V2 migration: the intent at that line is explicit, and `window-gmnotes.js` already does it the correct way. It failed *partially*, which is why it survived — `data.title` also feeds the chat-card title via `apiRollTitle`, and that path works. Now sets `options.window = { title }`; verified against core that `#mergeApplicationOptions` deep-merges, so `resizable`/`minimizable` survive.

- **`HookManager.removeCallback()` silently failed for any hook name containing an underscore** (`scripts/manager-hooks.js`): it recovered the hook name via `callbackId.split('_')[0]`, but ids are `${name}_${Date.now()}_${rand}` — so a hook named e.g. `myModule_dataReady` parsed back to `myModule`, the registry lookup missed, and it returned `false` while **leaking the callback forever**. Worse, `disposeByContext()` delegates here, so context cleanup silently failed too — the exact guarantee `context` exists to provide. It now locates the owning hook by searching the registry; the id format is no longer load-bearing.

- **`compendiums.resolveMany()` returned fewer results than inputs, misaligning every index after a blank** (`scripts/manager-compendiums.js`): `if (!rawName) continue;` skipped blank entries **without pushing a result**, breaking the "one result per input, in order" contract that both `api-compendiums.md` and the JSDoc guarantee. Callers doing `names.map((n, i) => results[i])` attached **wrong UUIDs to wrong names** — in the API whose job is turning encounter text into links, and encounter text is exactly where stray blanks come from. `resolve()` already returns a structured miss for empty input, so the fix was to stop skipping.

- **Two modules registering the same toolbar tool id silently clobbered each other** (`scripts/manager-toolbar.js`): `registerTool()` had no duplicate check — `registeredTools.set(toolId, ...)` blindly overwrote and returned `true`. The victim's button vanished, its `onClick` became unreachable, and it had **no way to detect this**, since it got `true` back and `isToolRegistered()` reported its own id as healthy while pointing at someone else's callback. `api-toolbar.md:419` documents the guarantee ("Returns `false`; tools must be unique") — the code never implemented it. Now rejects and logs when a **different** module claims a taken id. Deliberately still permits a module to re-register its **own** tools: at least one consumer (coffee-pub-cartographer) does that to refresh button state, and rejecting it would trade one silent failure for another.

- **Menubar tools sharing a `name` cross-fired** (`scripts/api-menubar.js`, `templates/menubar.hbs`): click dispatch matched `registeredTool.name === toolName` and `forEach` kept the **last** match, but only `toolId` is enforced unique — `name` is a CSS class and a label. Two modules registering `name: "settings"` meant one module's button invoked the other's `onClick` and toggled the wrong tool's `active` state, with no error. Tools now carry their `toolId`, the template emits `data-tool-id`, and dispatch keys on it, falling back to the old name scan so nothing can break.

- **`order: 0` on a toolbar tool became `order: 999`** (`scripts/manager-toolbar.js`): `toolData.order || 999` — `0` is falsy, so a tool asking to be first landed last. Now `??`.

- **`clearNotificationsByModule()` leaked its auto-dismiss timers** (`scripts/api-menubar.js`): it deleted notifications from the Map without `clearTimeout`, unlike its two siblings. `api-menubar.md`'s headline cleanup recipe points straight at it, so a module cleaning up on disable left live timers holding closures over `MenuBar` for the remainder of each duration.

- **A debug leftover could kill the entire menubar render** (`scripts/api-menubar.js`): `renderMenubar()` carefully wrapped its `partyLeader` settings read in an existence check and try/catch — then eleven lines later read the same setting **unguarded** under a `// Debug:` comment. If the setting wasn't registered yet, that threw, the outer catch swallowed it into a log line, and the menubar never rendered. Both it and an adjacent `middleGroups` were dead — assigned, never read. Deleted.

### Removed

- **`CombatStats.subscribeToUpdates()` / `unsubscribeFromUpdates()` — a documented API that never fired** (`scripts/stats-combat.js`, `scripts/api-stats.js`, `documentation/api/api-stats.md`): callbacks were collected into `_subscribers` and the set was cleared on unsubscribe, but **it was never iterated — there was no notify loop**. Every registered callback was dead on arrival. The code said so itself: *"Simple subscription system - in a real implementation, you'd want a proper event system."* `api-stats.md` documented it as working, shipped a worked example that could never fire, and advised unsubscribing on teardown. Consumers should use the `blacksmith.combatSummaryReady` hook, which works and is now the documented path.

- **Two of the three constant generators** (`scripts/constants-generator.js`, `scripts/manager-data-collection.js`). The module had grown **three** implementations of "turn an asset entry into a constant", all disagreeing:
  - `asset-lookup.js` — `path || id`. **Wrong** (see the volume fix above), and the one that shipped.
  - `constants-generator.js` — `.value` for volumes/icons/backgrounds, `.path` for sounds/banners. **Correct**, and reachable only from the `BlacksmithAPIGenerateConstants()` debug command.
  - `manager-data-collection.js` (`DataCollectionProcessor.generateConstants`) — `item.id`, unconditionally. **Wrong for everything.** Dead.

  The live generator is now the only one, with the correct rule and the reasoning recorded next to it. `DataCollectionProcessor`'s other job — building UI dropdown choices (`processCollection`, `filterByEnabledStatus`, `sortItems`, `buildChoices`) — had already been superseded: `settings.js` builds those directly and publishes them via `BLACKSMITH.updateValue('arrThemeChoices', …)`, with `refreshAssetDerivedChoices()` re-running after assets load, and `AssetLookup.getChoices()` covering the asset-driven ones. Nothing imported either file; neither was in `esmodules`; no sibling module referenced them. Removed the files, the `module.api.ConstantsGenerator` binding, and the debug command. ~510 lines. Both remain in git history if the `sortItems` / `priorityItems` logic is ever wanted back.

### Changed

- **`api-core.md` corrected against code** — the entry-point doc, and the one every consuming module reads first. It taught several things that could not work. **Both documented ways to reach the API were broken**: "Method 1: Direct Access (Recommended)" used a bare `BLACKSMITH` global (a `ReferenceError` in any module that didn't already import it), and the `blacksmithUpdated` recipe guarded on `data.type === 'ready'` — the hook passes the whole BLACKSMITH object, which has no `type`, so that callback **never fired**. Replaced with `module.api` / `window.BlacksmithConstants` and `BlacksmithAPI.get()`. Removed five phantom symbols that do not exist in the codebase: `BlacksmithAPI.getAssetLookup()`, `assetLookup.findByTag()`, `ModuleManager.getRegisteredModules()`, the `ICONSHIELD` constant, and `BlacksmithAPI.isReady()` (`isReady` is a static *property*; the method is `isAPIOpen()`). `playSoundLocalWithDuration` was documented as public but is **not** on `BlacksmithUtils` — `UtilsManager.getUtils()` never adds it — so it is `undefined` for every consumer; it is now marked internal with the working equivalent given. Corrected the silent-wrong-answer cases: the `arr*Choices` are **objects**, not arrays (`.length` is `undefined` — three examples read it), `getChoices(type, category)` takes **two** parameters and silently ignored the documented third (`tags`), so that example returned *all* interface sounds rather than the error ones; and `generateFormattedDate` takes an **enum** (`'date'`/`'time'`), not a pattern — the documented `'YYYY-MM-DD'` silently returned a full date-time string. Also fixed two bare module specifiers that cannot resolve in the browser (contradicting the correct absolute import taught eight lines above), a `registerModule` example whose `features: ['testing']` strings are silently dropped by the `feature.type && feature.data` guard and whose made-up module id made the call return `false` before features were ever read, and a self-contradiction on compendium slot count (0-15 at one place, 1-20 at another — the setting registers `range: {min: 0, max: 15}`). Version examples now point at `MODULE.APIVERSION` in `scripts/const.js` rather than hardcoding a number that rots.

- **Adopted a change workflow and updated the git rules in `CLAUDE.md`.** Idea→live gets a defined pipeline (orient in docs → reality-check code → plan if larger than a bug fix → todos → change → test *with stated verification* → doc updates → changelog → delete todos → BUILD). Two standing rules changed: the `BUILD x.y.z` commit now bundles the final docs + changelog + todo deletions with the version bump (was a lone bump), and syncing the wiki mirror is now Claude's step (blocked on a Windows checkout issue — see `TODO.md`). Firm principle recorded: **API and architecture docs never hold TODOs** — pending work lives only in `TODO.md`.

- **All 13 architecture docs audited against source; the three worst rewritten or gutted.** These are contributor-facing, so the failure mode differs from the API docs: nobody's module breaks, but a contributor builds the wrong thing. Two were **fiction**, three described **shipped work as future plans**, and one described a **completed migration as pending**.
  - **`architecture-hookmanager.md` rewritten, 1,411 → ~200 lines.** It contained a **398-line verbatim copy of the `HookManager` class** which had drifted into **resurrecting the `callbackId.split('_')[0]` bug removed in this same release** — plus it omitted `context`/`teardown` from the callback record, presented the dead `_throttle`/`_debounce` as the live path, and lacked the `pre*` cancel entirely. Every one of those defects existed *because the copy existed*. Also deleted: an invented rule ("⚠️ Parameter order is strict and must be exact!" — `registerHook` takes a **destructured object literal**; order is meaningless), a 155-line section asserting "Only one callback per hook name / Module B will OVERWRITE Module A's hook!" while proposing multi-callback priority dispatch as *future* work — **a feature that has shipped for months** — and ~300 lines of one-time migration runbook. A contributor reading it would have concluded the manager was broken and rebuilt what already works. It now documents the real internals, **none of which were documented before**.
  - **`architecture-rolls.md` trimmed, 797 → 522 lines.** Removed a 202-line "Schema-Driven Roll System" section that was **100% fiction**: `scripts/rules/` has **never existed in any commit** (`git log --all` on that path is empty), yet the section confidently specified D&D 5e resolution for Jack of All Trades, Remarkable Athlete, Reliable Talent, cover, auto-crit and exhaustion across 19 phantom symbols. Also removed a 99-line migration plan referencing a nonexistent `TODO.md` eight times. Added corrections: the flow is **three** functions, not four (`requestRoll()` is commented out under the code's own "LEGACY — NO LONGER USED" banner), `orchestrateRoll` **throws** without an existing message id rather than creating chat cards, and the documented socket direction is **inverted** (reality: roller → GM, not GM → clients).
  - **`architecture-window.md` corrected** — the inverse failure. A **built, wired, actively-consumed** window registry (`api-windows.js`, exposed at `blacksmith.js:1222-1226`, registered by `window-pin-layers.js:1983`, opened by `api-pins.js:582`) was labeled **"Planned"**, and a **completed** ApplicationV2 migration was described as pending, naming three windows as legacy. `grep -rE 'extends (Application|FormApplication)\b' scripts/` returns **zero** — every window extends `BlacksmithWindowBaseV2`. Someone could have built the registry a second time, or "migrated" an already-migrated window.
  - **`architecture-socketmanager.md` and `architecture-core.md` marked ⛔ do-not-trust** at the top, with the evidence, rather than silently deleted. SocketManager's doc is **81% phantom (67 of 83 symbols) and was born that way** — `git log -S` proves `_handleIncomingMessage`, `performanceMetrics`, `_initializeLocal`, and `_detectSocketLib` have **only ever existed in that doc file, in any commit**; it was added whole on a day when `manager-sockets.js` already looked as it does now. It invents a third transport, batching, reconnection, latency metrics, and — most dangerously — **a security model this code does not have** (real targeting is filtered *on receipt*; both transports broadcast, and the source says "emit() must never carry secrets"). Its one real asset, a still-accurate god-module analysis, is why it is flagged for rewrite rather than deletion. `architecture-core.md` is misnamed (it describes no "core"), duplicates better docs section-for-section, is wrong on both of its unique claims (**"4 esmodules"** — there are **9**; a **"Base Timer Class"** that does not exist), and its "Testing and Quality Assurance" section is invented whole — this repo has no tests, no runner, and one npm script. **Deletion proposed; the call is the author's.**
  - Full per-doc findings, including the ones deliberately left alone, are in `documentation/TODO.md`.

- **⚠️ Correction: there is no module-unload hook at all.** Earlier in this same cycle, six references to `Hooks.once('disableModule', …)` across four docs were corrected to `unloadModule`, on the grounds that `disableModule` appears zero times in code while `unloadModule` is used throughout Blacksmith. **That fix was wrong, and the correction is the finding.** `unloadModule` appears **zero times in Foundry v13 core**, and **nothing — not Foundry, not Blacksmith, not any installed module — ever calls `Hooks.call('unloadModule')`**. It is a listener convention that was never given an emitter (verified against a working control: `pauseGame` and `canvasReady` both resolve; these do not). Ten registrations in Blacksmith's own code have therefore **never run once** (`manager-canvas.js`, `manager-combatbar.js`, `manager-latency-checker.js`, `manager-navigation.js`, `manager-pins.js`, `manager-token-indicators.js`, `timer-combat.js`, `timer-planning.js`, `timer-round.js`, `ui-combat-tracker.js`), as have the two `closeGame` handlers in `blacksmith.js` and `manager-journal-dom.js` — so `EncounterToolbar.dispose()` and `JournalPagePins.dispose()` have never been called either. **The runtime impact is near zero** (Foundry has no runtime module-unload event; enabling or disabling a module forces a world reload that tears everything down anyway) — which is exactly why nobody noticed. The docs now say this plainly instead of teaching a third dead hook name: `api-hookmanager.md` carries the full explanation, and the six cleanup examples are annotated in place. **The ten dead code registrations are deliberately left alone** — deciding whether to emit the hook or delete the convention is a design call, tracked in `documentation/TODO.md`.

- **`api-hookmanager.md`** — corrected against code. Beyond the unload finding above, it taught three **phantom hooks** as its only examples for its marquee features: `closeGame` (cleanup), `userLogin` (the sole `once` example), and `searchInput` (the sole `debounceMs` example) — all zero occurrences in Foundry, so anyone testing `once` or `debounce` by copying the docs concluded the feature was broken. Replaced with `userConnected` and `updateActor`. `renderPlayerList` is a **v12 name**: Foundry emits `render{ClassName}` for a class and each parent, and the v13 class is `Players`, so the hook is `renderPlayers`. The flagship UI example was copy-paste-broken twice over — it registered `renderChatMessage` (silently rewritten to `renderChatMessageHTML`) and called `html.find(...).addClass(...)`, but v13 passes a **native `HTMLElement`**, and Blacksmith's compatibility shim returns a **plain Array** carrying only `.click` — so `.find()` survives and `.addClass()` throws. The canonical `options` block advertised `{ once: true, throttleMs: 50, debounceMs: 300 }` — the one shape guaranteed to misbehave: `throttleMs` silently discards `debounceMs`, and `once` + `debounceMs` **guarantees the callback never fires** (removal clears the pending timer before it elapses). Also corrected a `priority: 50` example that contradicted the doc's own 1–5 scale and made the hook invisible to `showHookDetails()`, which only iterates 1..5.

- **`api-sockets.md`** — corrected against code. The **first code block in the document** — the one every integrator copies — declared `const sockets` twice in one scope: a hard `SyntaxError`. `socket.emitToOthers` is **phantom** (the real method is `executeForOthers`), and because the example guarded on `if (socket && socket.emitToOthers)`, the block was a **silent no-op that never warned**. Two contracts the code does not honor are now scoped honestly rather than stated flatly: `emit()` **only rejects under SocketLib** — the native fallback never inspects `game.users`, has no `return` at all, and the wrapper turns that into a resolved **`true`**, so on a SocketLib-less world `emit(..., { userId: offlineUser })` reports success and delivers nothing; and `register()` **silently overwrites** an existing handler (returning `true`, without even logging the second registration), with no `unregister` method anywhere on the surface. Documented the sharper native-only hazard: external handlers share the **same map Blacksmith's internals use**, so registering `'ping'` destroys Blacksmith's own latency checker — making the "use module-specific event names" advice a requirement, not a style note.

- **`api-canvas.md`** — corrected against code. `blacksmith.CanvasLayer` is **`null` on the initial canvas draw**: the `canvasReady` handler that assigns it is registered during `ready`, and Foundry fires `canvasReady` **before** `ready` (core: `await this.canvas.initializing` precedes `Hooks.callAll("ready")`), so the assignment is always too late for the first scene and only lands after a scene switch. It is *additionally* gated behind the unrelated `enableSceneClickBehaviors` setting — default on, but turn it off and the layer API is `null` **permanently**, though the layer itself is registered unconditionally and works. `window.BlacksmithCanvasLayer` is worse: the sync that sets it guards on `if (api.CanvasLayer)` and runs before any of this, so it is **never** assigned. Consumers are now steered to `BlacksmithAPI.getCanvasLayer()`, which works in every case via its raw-canvas fallback.

- **`api-requestroll.md`, `api-campaign.md`, `api-gmnotes.md`, `api-create-journal-entry.md`, `api-chatcards.md`, `api-pins.md`, `api-toolbar.md`** — corrected against code. Highlights: `createJournalEntry` is documented as returning the created entry but **discards it on all three paths** and always resolves `undefined` (code fix deferred — the existing-entry branches need a contract decision). Request Roll's `actors` table specified `{ id: tokenId, actorId }`, which **misses the token branch** (`if (a.tokenId != null && a.actorId != null)`) and falls back to matching *every* placeable for that actor — so an actor with two tokens silently produced **two roll rows**; `options.callback` is never invoked anywhere; `options.actors` is silent-mode-only. `api-campaign.md` documented a `narrative.cardImage` whose setting **no longer exists** (collapsed into `imagePath`; only a legacy migration read survives) and omitted the real `characterImagePath`; the `isCurrentUser` prose omitted its leading `actorId` guard, mis-stating a permission check. `gmNotes.set()` is a **merge**, not the documented "replace". `api-chatcards.md` had the `default` theme's display name as "Default" (it is **"Tan"**) and omitted the `amber` theme entirely — both changed deliberately in an earlier release, both missed here. `api-pins.md`'s bulk-delete "handles all deletion paths" recipe **missed the main path** (the Manage Pins "Delete All" passes no `moduleId`, so the `moduleId === MODULE_ID` guard never fires — leaving exactly the dangling refs the section exists to prevent); `place()`/`unplace()` "Throws" lists contradicted the same methods' documented `null` returns; the reserved-profile-name protection is **UI-only** (`saveVisibilityProfile` throws only on an empty name, while `applyVisibilityProfile('All Pins')` throws `Profile not found`); `getPinTaxonomyChoices()` does **not** merge "every tag ever used" (freeform and registry-added tags never appear); `silent` is inert on `create`/`update`/`delete`; and the "Ping Pin" context-menu item doesn't exist (ping lives in an **Animate** submenu).

- **`api-menubar.md`, `api-window.md`** — corrected against code. `api-menubar.md` led with a 99-line "⚠️ Critical" section built on a falsehood: that an `onClick` handler "loses access to your module's imports" and must re-import inside the callback. Closures do not work that way; the real caveat is that **`this` is unbound** inside `onClick`. The invented workaround was taught twice (again under troubleshooting) and would have shaped how every consumer wrote their handlers. `api-window.md` shipped a code example **missing `async` on a method that awaits** — a hard SyntaxError for anyone who copied it — and called `blacksmith.api.registerToolbarTool` where `blacksmith` is already `.api`. Across four docs, six references taught `Hooks.once('disableModule', …)`: `disableModule` is not a Foundry hook and appears **zero times** in Blacksmith's code — every cleanup callback taught by those docs never ran. Blacksmith's own convention is `unloadModule`.

- **`api-stats.md`, `api-tags.md`** — corrected against code. `api-stats.md` still claimed the combat history keeps only the last 20 entries in three places; 13.9.1 fixed that lie in the two *code* comments and missed the public doc, which is the copy consuming modules read. It now states that history is deliberately unbounded and documents `clearHistory()` / `removeCombat()`. `api-tags.md`'s widget embed pattern could not work as written — wrong partial invocation (`tags=TagWidget` as a hash argument, which the partial can't read), two examples referencing variables they never assigned, and no mention of `TagWidget.activate()`, without which the widget renders inert. Filter mode is now marked not-implemented: the template renders the toggles and nothing listens to them.

## [13.9.1]

### Fixed

- **Quick View's brightness boost did nothing — the "Darkness overlay strength" slider had no visible effect at any value** (`scripts/utility-quickview.js`, `lang/en.json`): Every lever the lighting boost pulled was a v11-era API that no longer exists, each one silently skipped by its own defensive guard. The `gmVision` illumination uniform appears **zero times** in Foundry v13.351's client bundle (it was a Perfect Vision module uniform, never core), `canvas.fog.layer` is now `canvas.fog.sprite`, and `canvas.sight` is gone entirely — so "brighter GM view" and "fog transparency" were no-ops on every v13 install. The one surviving lever, the darkness layer's filter alpha, only fades *darkness sources* (dark regions and negative lights), not the scene's ambient darkness — and even that missed the first canvas after load, because core draws the layer with a `VoidFilter` (which has no `alpha`) before Quick View's `drawCanvasDarknessEffects` filter-swap hook registers. Brightness now comes from a **GM-local darkness-level override**: the slider scales the scene's darkness level (0.2 → 0, full daylight; 1 → the scene's normal darkness) and applies it via `canvas.environment.initialize()` — the same mechanism core's `animateDarkness` uses — injected through the `configureCanvasEnvironment` hook so every core re-initialization (scene darkness edits, darkness animations, canvas redraws) preserves the override instead of snapping back. Render-only: the scene document in the database is never touched and players are unaffected. Two core landmines are handled explicitly: `EnvironmentCanvasGroup#initialize` **writes the effective level back onto the scene document in memory**, so the true value is captured in a per-scene baseline and restored on deactivate and across scene switches (Quick View persists across scenes; without this the baseline would feed back on itself and each reapplication would darken less); and `initialize()` triggers a vision refresh that fires `sightRefresh`, whose handler calls the boost again — a no-change guard on `canvas.environment.darknessLevel` breaks the loop. An `updateScene` hook rebases the saved baseline when the GM edits the real scene darkness while Quick View is on. The darkness-source fade still applies alongside, with the alpha-filter swap now performed on demand so it also works on the first canvas. The three dead paths and their orphaned state fields were removed rather than "fixed" — they cannot execute on v13/v14 (`module.json` minimum is 13). Verified live: the slider now sweeps from daylight to normal scene darkness in real time while Quick View is active. Slider hint rewritten to describe the actual behavior; findings recorded in `architecture-blacksmith.md` §9A.

- **`HookManager.removeHook()` returned `undefined` on success** (`scripts/manager-hooks.js`): Its JSDoc declares `@returns {boolean} Success status`, and it does return `false` when the hook isn't found — but the success path fell off the end of the function, returning `undefined`. So `if (HookManager.removeHook(name))` was falsy **exactly when it worked**. Latent rather than live: the only caller is the internal `unregisterHook`, which ignores the return value. But it is a public method on `module.api.HookManager` and the documentation told consumers to branch on it. Now returns `true`.

### Removed

- **`BLACKSMITH.rolls.execute` — a public API surface that had been `undefined` for eleven months** (`scripts/blacksmith.js`, `scripts/const.js`): `blacksmith.js` did `const { executeRoll } = await import('./manager-rolls.js')` during `ready` and assigned it to `BLACKSMITH.rolls.execute`. `executeRoll` was added 2025-08-23 and **removed three days later**, on 2025-08-26, by a cleanup commit that missed the import site. `manager-rolls.js` exports `orchestrateRoll`, `processRoll`, `deliverRollResults`, and `updateCinemaOverlay` — never `executeRoll`. Destructuring a missing export from a dynamic import yields `undefined` silently instead of throwing, so nothing ever failed loudly: the surface went from `null` to `undefined` and was never callable. Nothing consumed it — verified across all 13 Coffee Pub repos — which is why it went unnoticed. Removed the dead import, the assignment, and the `rolls: { execute: null }` placeholder in `const.js`, rather than rebinding it to `orchestrateRoll`, which has a different signature: that would invent an API contract, not restore one. Note the pattern — this is the third API found broken this cycle that **Blacksmith itself never called**. An API nothing exercises has nothing testing it.

### Changed

- **`architecture-pins.md` rewritten** — it predated the entire layers/tags/filtering system, so a contributor would have concluded none of it was built. `api-pins.md` was accurate throughout; this was contributor-facing drift only.
- **Corrected two false "keeps the last 20 combats" claims** (`scripts/settings.js`, `scripts/stats-combat.js`): the `combatHistory` setting hint and the comment above the `_storeCombatSummary()` call both promised a bounded array. The code deliberately keeps everything — *"no pruning to ensure lifetime stats remain verifiable"* — so the world setting grows without bound. The code is the intent; the two comments were wrong. Both now say so and point at `StatsAPI.clearHistory()` / `removeCombat()`.
- **Documented a shared-flag hazard in code** (`scripts/stats-combat.js`): three subsystems read/write `combat.setFlag(MODULE.ID, 'stats')` with different expectations — `stats-combat.js` writes `currentStats` wholesale, `timer-round.js` read-modify-writes it and owns `accumulatedTime` (a field `stats-combat.js` has never heard of), and `manager-combatbar.js` reads it. Left the behavior alone and added a warning comment; deciding who owns the key is a design call that needs a live session, not a patch. Tracked in `documentation/TODO.md`.

## [13.9.0]

### Removed

- **Blacksmith no longer bundles compendiums** (`module.json`, `.github/workflows/release.yml`, `.gitignore`, `packs/`): The `user-manual`, `treatments`, `blacksmith-tables`, and `blacksmith-injuries` packs have been removed from the manifest, the release zip, and the repo. **This is user-visible**: a module compendium exists only because `module.json` declares it, so on update these four compendiums disappear from Foundry even though the files are untouched on disk. Anyone who wants to keep that content must import it into a **world** compendium *before* updating — after the update there is nothing to import from. Nothing else breaks: no Blacksmith code and no sibling module ever referenced these packs by id (verified by grep across all 13 Coffee Pub repos), and users already choose their own compendiums and roll tables in Blacksmith's settings — `settings.js` builds the choices from `game.packs.values()` and `manager-compendiums.js` resolves the selection, with settings for Actor, Item, Spell, Feature, JournalEntry, RollTable, and Cards. A compendium is not part of a module; shipping one is a packaging choice, and the hub has no reason to carry a payload. Two of the four were also broken as shipped: `treatments` contained no data at all, and every one of `blacksmith-tables`' 30 results was a document reference pointing into the D&D Dungeon Master's Guide module or a private campaign module — so those tables only ever resolved on their author's machine. Also removed: 72 orphaned LevelDB `lost/MANIFEST-*` repair artifacts that had been committed and were shipping to every user inside the release zip, plus the `LOCK`/`LOG`/`LOG.old` runtime files.

### Fixed

- **`ModuleManager.registerModule()` never worked — every Coffee Pub module's registration silently failed** (`scripts/manager-modules.js`): `registerModule()` rejected any module that wasn't already in `registeredModules`, and that registry was populated by `_detectInstalledModules()` iterating `window.COFFEEPUB?.MODULES` — **a key nothing in any repo has ever assigned**. `window.COFFEEPUB` is created by `asset-lookup.js` and only ever holds generated *asset* constants; the separate exported `COFFEEPUB` in `api-core.js` holds exactly two keys (`blnDebugOn`, `strDEFAULTCARDTHEME`). So the registry was always empty, and every caller hit the not-found guard and got `false` back. Nine modules call it — Artificer, Bibliosoph, Cartographer, Crier, Curator, Scribe, Squire, Vault, and the prototype — and all nine failed invisibly, because the error is logged with `blnDebug = true` and is therefore suppressed unless global debug mode is on. Knock-on effects: `isModuleActive()` always returned `false`, `getModuleFeatures()` always returned an empty Set, and `getFeaturesByType('menubarIcon')` in `api-menubar.js` always returned `[]`. `_detectInstalledModules()` now discovers active Coffee Pub modules directly from `game.modules` by id prefix, and `registerModule()` self-registers on demand after validating against `game.modules`, so a caller can no longer fail merely because auto-detection missed it. Caller-supplied `name`/`version` override what Foundry reports. Timing is unchanged — this still runs in `init`, exactly where the previous code already called `game.modules.get()`. **Not yet verified in a running Foundry**: the repo has no test framework, so this has only been syntax-checked. Root cause worth noting: Blacksmith registers its own menubar tools through `registerMenubarTool()` and that API works; it has never called `registerModule()` on itself, and nothing else tested it.

- **`design-system.md` told module authors to import a file that does not exist** (`documentation/design-system/design-system.md`, `documentation/api/api-window.md`): §14.4 instructed consumers to `import { WindowBase } from './window-base-v2.js'`. That shim was deleted from `scripts/` some time ago; the import would simply fail. The example now reads the base class from `module.api` (`BlacksmithWindowBaseV2`), which is the actual supported contract — file paths were never it. `api-window.md` also described the shim as current in two places. The stale instruction survived because a completed plan documenting the removal was never deleted, so nothing prompted the docs to catch up.

- **`architecture-toolbarmanager.md` credited Blacksmith with six tools it does not own**: The doc stated the Blacksmith Utilities toolbar has predefined tools `regent, lookup, character, assistant, encounter, narrative, css, journal-tools, refresh`. Six of those moved to `coffee-pub-regent` — `manager-toolbar.js` says so in its own comments. Only `css`, `journal-tools`, and `refresh` are Blacksmith's; everything else on the toolbar arrives via `registerToolbarTool()`.

- **Docs described features that had moved to other modules**: `api-menubar.md` presented Herald's "Broadcast View Mode" as a Blacksmith tool (it names no sibling, so no name-based search would ever have found it — only a behavior-word sweep did); `architecture-window.md` still listed `TokenImageReplacementWindow` as a Blacksmith window awaiting ApplicationV2 migration, though it moved to Curator; and `architecture-blacksmith.md` contradicted itself, documenting the Regent extraction as complete in §4/§5/§7 while §11 listed it as planned future work.

- **Restored 18 KB of performance documentation that had been destroyed by a filename collision**: `documentation/performance.md` grew to 18,367 characters of stack-ranked findings, per-rank detail, and heap-snapshot procedure, then dropped to a 459-character stub in `BUILD 13.5.10`. The stub declared "the canonical file is **PERFORMANCE.md** (uppercase)" and linked to it — but on a case-insensitive filesystem that link resolves to the stub itself, and git only ever tracked the lowercase path, so the uppercase "canonical" file never existed. The classic Windows case-rename trap: `PERFORMANCE.md` *is* `performance.md`, so writing the stub overwrote the content. Recovered and redistributed rather than restored wholesale — open items to `TODO.md`, design and measurement method to `architecture-blacksmith.md` §9B, completed history dropped.

- **Broken and stale documentation links**: 5 dead markdown links (three pointing at a `cartographer.md` that has never existed, one at a cross-module path with the wrong depth, one flat path missing its subfolder) and 17 stale citations of the old flat `documentation/api-*.md` / `documentation/architecture-*.md` layout across 8 files. `CHANGELOG.md` was deliberately left alone — it is history, and correcting it would misrepresent what was true at the time.

### Changed

- **Documentation restructured around five kinds** (`CLAUDE.md`, `documentation/`): Overview, TODO, CHANGELOG, Architecture, and API — everything else is noise. Plans are the one exception and are explicitly scaffolding: transitional, dismantled into the five kinds, and deleted when complete. Three rules keep them from accumulating — a plan must declare its status, a plan is never a source of truth, and complete means delete rather than archive. Four of seven plans were dismantled under this rule after verifying each against the code: `plan-rename.md` (marked Complete since April; its only live item was already done, but it was keeping the broken `window-base-v2.js` import instruction alive above), `plan-settings.md` (load-gate vs on/off model → architecture §8; open items → `TODO.md`), `plan-token-naming.md` (design → new `architecture/architecture-token-naming.md`; phases 3–4 → `TODO.md`), and `plan-pins.md` (dead and actively misleading — its "Locked Decisions" locked in a `group` field that schema v4 deleted; three pieces of rationale migrated to `architecture-pins.md`). Also deleted: `request-registerapi.md`, a rejected feature request whose proposal was superseded by the shipped register-inward pattern, and `pattern-inventory.md`, a cross-module CSS audit of two sibling modules whose conclusions had already landed in `design-system.md`. Removed ~30 lines of genuine cross-module coupling — sibling file paths, config values, and internals documented inside Blacksmith's docs — while keeping the ~250 references that legitimately show a sibling *calling* Blacksmith's API.

- **Added `CLAUDE.md`** — conventions, module boundaries, the doc taxonomy, and pointers. Deliberately thin: hard-won facts belong in the architecture docs, which are the anti-crawl artifact. New `architecture-blacksmith.md` §9A (Traps) and §9B (Performance-critical design) capture what previously required an hour of grep to rediscover — including that `_setupGlobalObserver` and `_setupDomObserver` still exist in the source, complete with a `MutationObserver` and a 500 ms interval, and are **never called**.

- **`.gitignore`**: `packs/` (no longer part of the module) and `_gsdata_/` (Google Drive sync artifacts, which had been committed).

## [13.8.5]

### Fixed

- **Sockets API — `emit()` targeting options were silently ignored; every "targeted" message broadcast to all clients** (`scripts/manager-sockets.js`, `scripts/blacksmith.js`, `documentation/api/api-sockets.md`): `api-sockets.md` documented `sockets.emit(eventName, data, {userId})` ("send to specific user only") and `{recipients: [...]}`, but neither transport honored them — reported by the Bibliuosoph module. On the SocketLib path, `emit()` always sent via `executeForOthers` (a broadcast); the justifying comment claimed SocketLib has no targeted methods, which is false (`executeAsUser` / `executeForUsers` exist). Worse, the generic receive-side router never checked `payload.options` against `game.user.id` and didn't pass `options` to handlers, so receivers couldn't even self-filter. On the native fallback path, `options` wasn't copied into the payload at all. Consequence: code written against the docs misbehaved silently — "open this dialog for user X" opened it for everyone — and every targeted payload fired every client's registered handler. Now: `options.userId` routes through `executeAsUser` (rejects if the target user doesn't exist or isn't connected; fires the local handler if you target yourself), `options.recipients` routes through `executeForUsers` (passed a copy, since SocketLib mutates the array; disconnected users are silently skipped; your own ID in the list fires your local handler), and only untargeted emits broadcast. The native fallback carries `options` in the payload and enforces targeting on receipt — the same strategy SocketLib itself uses, since Foundry's relay always broadcasts module socket events — and dispatches locally when the sender is among the explicit recipients, matching SocketLib semantics. Both receive paths share a `_isLocalRecipient()` check, so even a broadcast from an older Blacksmith version is filtered correctly on updated clients. Verified live with a GM + player client: broadcast excludes sender, `userId`/`recipients` deliver to exactly the addressed clients, self-targeting fires locally only, and a bogus target rejects loudly. **Privacy caveat now documented**: targeting controls which clients *dispatch* the event to handlers — under both transports the payload still travels over a broadcast socket and is visible to anyone inspecting traffic, so `emit()` must never carry secrets.

### Changed

- **Sockets API — `emit()` propagates delivery failures** (`scripts/blacksmith.js`): The `api.sockets.emit` wrapper fired the underlying emit and resolved `true` without awaiting it, which would have turned an `executeAsUser` rejection (target user offline) into an unhandled promise rejection. It now awaits the transport call, so targeted-delivery failures reject the caller's promise (and are logged). Note one behavior change for `userId` emits on SocketLib: they return SocketLib's request promise, which resolves after the remote client's handler runs — callers who don't await are unaffected.

### Added

- **Compendiums API — compendium mapping + plain-text-to-UUID resolution** (`scripts/api-compendiums.js`, `scripts/compendium-types.js`, `scripts/manager-compendiums.js`, `scripts/blacksmith.js`, `api/blacksmith-api.js`, `documentation/api/api-compendiums.md`): The GM's Compendium Mapping is now a first-class public API at `game.modules.get('coffee-pub-blacksmith').api.compendiums` (also `BlacksmithAPI.getCompendiums()` and `window.BlacksmithCompendiums`). Previously the mapping was only reachable as raw `BLACKSMITH.arrSelected*Compendiums` constants — which carry pack ids but none of the search semantics — so every consuming module (and four separate places inside Blacksmith) hand-rolled its own lookup loop. **Mapping**: `getTypes()`, `getMapping(type)` (pack ids in priority order plus `searchWorldFirst`/`searchWorldLast`/`searchOrder`), `getSelected(type)`, `getSearchOrder(type)`, `getChoices(type)`. **Resolution**: `resolve(name, type, options)` returns a structured result (`found`, `uuid`, `matchedName`, `packId`, `source`, `matchType`, `confidence`, `count`, `link`) and never throws on a miss, an unconfigured type, or a missing pack; `resolveMany()` batches a list and loads each pack index once for the whole batch; `resolveLink()` returns a ready-to-embed `@UUID[...]{Name}` (falling back to the plain name when unresolved); `resolveDocument()` loads the document. **Utilities**: `normalizeType`, `getTypeLabel`, `parseQuantity`, `formatLink`, `clearCache`. Every method accepts any type alias case-insensitively (`'actor'` / `'Actor'` / `'monster'` / `'feat'` / `'journal'` / `'rolltable'`…), so callers never need to know that Actor is stored under `monsterCompendium{i}` and Feature under `featuresCompendium{i}`. Matching is **tiered and exact-first across all configured sources**: an exact (case-insensitive) match in *any* source beats a `startsWith` match in a higher-priority source, so priority breaks ties *within* a tier rather than overriding match quality; the loose `includes` tier is opt-in via `{fuzzy: true}` and `{exact: true}` restricts to exact only. `Spell` and `Feature` are synthetic types drawn from Item packs and are now filtered by document subtype (`spell` / `feat`) in compendium indexes as well as the world, so e.g. `resolve('Fireball', 'feature')` correctly returns not-found. Pack indexes are cached (invalidated on `updateCompendium`); world collections are read live so they never go stale. Returned UUIDs are always bare (`Compendium.pack.Actor.id` / `Actor.id`) and always accepted by `fromUuid()` — the legacy `@Compendium[...]` enricher format is no longer produced anywhere. See `documentation/api/api-compendiums.md`.

- **Campaign API — `getPartyLeader()`** (`scripts/api-campaign.js`, `scripts/manager-campaign.js`, `documentation/api/api-campaign.md`): The hidden `partyLeader` setting was read directly by a dozen internal call sites but was absent from the Campaign API, so consuming modules had to reach into `game.settings.get()` themselves. `campaign.getPartyLeader()` now returns `{ userId, actorId, user, actor, name, isCurrentUser }` with the User and Actor already resolved. `isCurrentUser` mirrors the existing `isCurrentUserPartyLeader()` semantics — true when the stored `userId` matches, **or** when the current user owns the leader's actor (legacy worlds sometimes stored the GM's `userId`). Returns the same shape with empty/null fields when no leader is configured; never throws.

### Changed

- **Compendium type taxonomy consolidated into a single source of truth** (`scripts/compendium-types.js`, `scripts/settings.js`, `scripts/manager-compendiums.js`, `scripts/manager-journal-tools.js`, `scripts/utility-common.js`, `scripts/utility-json-import-compendium-lists.js`): The type-token → setting-key mapping existed in three drifted copies (`settings.js` used `Actor`/`Feature`, `manager-compendiums.js` used `actor`/`feature`, `manager-journal-tools.js` had its own), which is what let the forward and reverse maps disagree (see Fixed). All of it now lives in `compendium-types.js` — `normalizeType`, `getCompendiumSettingPrefix`, `getNumCompendiumsSettingName`, `getSelectedArrayName`, `getSearchWorldPlural`/`FirstKey`/`LastKey`, `getChoicesArrayKey`, `getTypeLabel`, `getDocumentClass`/`Subtype`/`PackType`, `getWorldCollection`, `getMappedTypes`, `formatPackLabel`, `extractTypeFromCompendiumSetting` — with per-type overrides for the historical backward-compat prefixes and mechanical derivation for everything else, so new Foundry pack types work without a code change. `settings.js` re-exports `extractTypeFromCompendiumSetting` for existing importers. The compendium label format (`"dnd5e: Monsters (SRD)"`) was also duplicated between `settings.js` and the import lists; both now call `formatPackLabel`. Net effect across the change is ~200 fewer lines despite adding a full API and its documentation.

- **Internal callers migrated onto the resolver** (`scripts/utility-common.js`, `scripts/manager-compendiums.js`, `scripts/manager-journal-tools.js`, `scripts/utility-json-import-compendium-lists.js`): `buildCompendiumLinkActor`, `buildCompendiumLinkItem`, `findMonsterUUID`, `CompendiumManager.searchItem`/`searchSpell`/`searchFeature`/`searchActor`/`searchInSource`/`searchInWorld`/`searchInCompendium`/`processItemList`/`fetchItemDocuments`, `JournalTools.getCompendiumSettingKeys`, and `getConfiguredActorCompendiums`/`getConfiguredItemCompendiums` all keep their existing signatures but are now thin wrappers over the one resolver. **Behavior changes worth knowing**: item lookups no longer fall back to substring (`includes`) matching — that tier is now opt-in — and resolution is exact-first across sources rather than exhausting all tiers within each source before moving on, so in worlds with overlapping packs a name may now resolve to a different (better-matching) pack than before. Actor links remain exact-match only, as they always were. `CompendiumManager`'s legacy `searchInWorld`/`searchInCompendium` previously returned *different formats* (a bare UUID vs. an `@Compendium[...]` string); they now consistently return bare UUIDs. `getCompendiumSettings(type)` and `getSearchOrder(settings, type)` are retained but deprecated in favor of `getMapping(type)`.

- **`toSentenceCase` returns `''` instead of `false` for empty input** (`scripts/api-core.js`): The function is a string helper that returned a boolean for nullish/empty input, which meant `{{...}}` template expressions rendered the literal text **"false"** rather than nothing. It now returns `''`. No call site compares the result to `false`, and every existing falsy guard (`if (!x)`, `{{#if x}}`) behaves identically since `''` is also falsy. Non-string input still coerces (`0` → `"0"`), so a zero value is not mistaken for empty. Note this helper is re-exported to other modules via `api.utils.toSentenceCase`.

- **Integration docs redirect to the Compendiums API** (`documentation/api/api-core.md`): The Compendium Configuration section still taught modules to iterate `BLACKSMITH.arrSelectedMonsterCompendiums` and hand-roll a search loop — examples that ignore `searchWorldFirst`/`searchWorldLast` entirely and therefore silently disagree with the GM's configuration. The section now leads with a pointer to `api-compendiums.md`, the "Related Documentation" index lists every API doc (it previously omitted campaign, tags, pins, gmnotes, chatcards, stats, and window), and the "For AI Assistants" guidance explicitly rules out reading `monsterCompendium1`/`numCompendiumsActor`, iterating the `arrSelected*` arrays to find a document, and hand-building `@UUID[...]` strings. Also corrected two doc errors: `arrSelectedActorCompendiums` was listed as a synonym of `arrSelectedMonsterCompendiums` but is **never created** (Actor has always been stored under the `monster` token), and the Spell/Feature arrays were undocumented along with the fact that their subtype filtering happens inside `resolve()` and is not encoded in the arrays.

### Fixed

- **Compendium auto-reordering was a silent no-op for Actor and Feature** (`scripts/compendium-types.js`, `scripts/settings.js`): `extractTypeFromCompendiumSetting` PascalCased the setting prefix without inverting the backward-compat special cases, so `monsterCompendium1` → `"Monster"` and `featuresCompendium1` → `"Features"`. `reorderCompendiumsForType` then looked up `numCompendiumsMonster` / `numCompendiumsFeatures`, which are never registered, and returned early — so changing an Actor or Feature compendium to `-- None --` never compacted the configured packs upward. `Item`, `Spell`, and `JournalEntry` happened to round-trip correctly and worked. The reverse mapping now inverts the overrides explicitly, and lives beside the forward mapping so the two cannot drift apart again.

- **World items/spells/features were silently dropped during character import** (`scripts/manager-compendiums.js`): `fetchItemDocuments` extracted the pack and id with a regex that matched only the `@Compendium[...]` format, but `searchInWorld` returned a bare UUID (`Item.abc`). World results therefore failed the regex and were skipped with no error — so with **Search World Items First** enabled, matching world items never landed on the imported actor. Resolution now returns one consistent UUID format and documents are loaded via `fromUuid()`, which handles both world and compendium UUIDs.

- **`findMonsterUUID` returned `Actor.undefined` for world matches** (`scripts/utility-common.js`): The world-first branch read `foundActor.system._id`, which is undefined — the parallel branch in `buildCompendiumLinkActor` correctly used `foundActor.id ?? foundActor._id`. Both paths now share the resolver, which uses the document's own `uuid`.

- **Journal Tools' "is this link optimal" check always failed** (`scripts/manager-journal-tools.js`): It read `game.settings.get('coffee-pub-blacksmith', 'actorCompendium')` / `'itemCompendium'` — unnumbered keys that are never registered (and `actor` is not even the right token; Actor maps to `monster`). `game.settings.get` throws on an unregistered key, so the function always fell into its `catch` and returned `false`, marking every existing link as non-optimal. It now reads Priority 1 via `compendiumManager.getSelected(entityType)`.

- **`toSentenceCase` threw on `undefined`** (`scripts/api-core.js`): The guard was `str === null`, which does not catch `undefined`, so `undefined.toString()` raised `TypeError: Cannot read properties of undefined (reading 'toString')`. Because several callers pass optional JSON fields straight in with no default — `journalData.foldername` (`utility-common.js`), the encounter card's `cardtitle`/`cardimagetitle`, and the injury `title`/`imagetitle`/`category`/`severity` — **any import JSON omitting one of those fields failed outright**, which AI-generated JSON does routinely. The guard is now `str == null`, catching both.

- **Settings-change handler never matched the `numCompendiums*` keys** (`scripts/blacksmith.js`): The pattern `/^(numCompendiums|.+Compendium\d+|…)$/` anchored `numCompendiums` exactly, so it matched only that literal string and never `numCompendiumsActor` etc. (contradicting its own comment). The consequence was masked because those settings carry `requiresReload: true`. Corrected to `numCompendiums.+`.

- **`Cards` compendium type never resolved its heading** (`scripts/compendium-types.js`): The type-label and plural maps keyed `'Card'` and `'Stack'`, but Foundry's actual pack type is `Cards`, so those entries never matched and `headingH3CardsCompendiums-Label` (present in `lang/en.json`) rendered as a raw localization key. The taxonomy now keys `Cards`.

- **World searched twice when both world toggles were enabled** (`scripts/manager-compendiums.js`): With `searchWorld{Type}First` *and* `searchWorld{Type}Last` both on, the world was appended to the search order twice and scanned redundantly. The order now de-duplicates (world-first wins).

- **`arrSpellChoices` and `arrFeatureChoices` were computed twice, identically** (`scripts/settings.js`): Both filtered `game.packs` to Item packs with byte-identical reduce blocks. Now computed once and copied.


## [13.8.3]

### Fixed

- **Menubar tool labels went stale after a dynamic `title()` change** (`scripts/api-menubar.js`, `_toolbarIconsLayoutSignature`): `renderMenubar` compares a structure fingerprint and, when unchanged, takes the lightweight-refresh path (`_applyMenubarLightweightRefresh`), which only re-patches leader / movement / timer / vote — **not** tool labels. The fingerprint's per-tool signature was `toolId:visible:zone:group:active:order` and **did not include the resolved `title`**, so a tool whose only change was its dynamic label (e.g. Herald's View Mode tool switching modes) kept the same fingerprint → lightweight refresh → the button showed a stale label until some unrelated structure change (opening the secondary bar, a leader/movement/notification change) forced a full rebuild. The signature now also includes each visible tool's resolved `title` (guarded with try/catch), so a label-only change alters the fingerprint and triggers a full re-render. Full rebuilds still only occur when a title actually changes, so there is no added render churn and no loop (the new title is captured in the stored fingerprint, returning subsequent renders to the lightweight path).


## [13.8.2]

### Changed

- **JSON import — remember compendium/world selections** (`scripts/settings.js`, `scripts/registry-json-import-journals.js`): The per-compendium (Compendium Actors / Items) and World checkboxes on the Generate tab now persist. Selections are saved to a hidden world setting (`journalPromptCompendiumSelections`) on Copy/Save and re-applied when the window reopens — a newly configured compendium still defaults to checked, but anything you unchecked stays unchecked. Previously the checkboxes reset to defaults on every open.

- **JSON import — image row layout + labels** (`templates/window-json-import-body.hbs`, `scripts/registry-json-import-journals.js`, `scripts/window-json-import.js`, `styles/window-json-import.css`): The narrative/character image "use this image" toggle moved inline to the **left of the path input** with no visible label (tooltip + aria-label only); the field labels dropped "Default" (now **"Narrative Image"** / **"Character Image"**). Removed the now-unused `checkboxLabel`. The checkbox still carries `data-prompt-checkbox`, so its state is read/persisted unchanged.

- **Area prompt — cleanup** (`prompts/prompt-journal-profile-area.txt`, `scripts/registry-json-import-journals.js`): Removed the legacy `[ADD-IMAGE-PATH-HERE]` token from the area path (prompt mention + the duplicate replacement in `applyAreaJournalGeography`; the encounter prompt's separate use is untouched). Tightened repeated guidance so each rule has one canonical home: the conversation-name rule (CONVERSATIONS.NAME) and the "imagetitle is not a generation prompt" warning (IMAGETITLE section) now keep short pointers elsewhere instead of full restatements; dropped a redundant anti-example block.

- **Area prompt — reads correctly with no catalogs; breadcrumb uses the clean title** (`prompts/prompt-journal-profile-area.txt`, `scripts/parsers/parse-journal-area.js`): When no compendium/world boxes are checked the catalog sections are omitted, but the prompt previously still referenced "catalogs below," which was confusing. The LINKER and CONVERSATIONS.NAME guidance now phrase catalogs as optional ("when they are provided"). Removed an inline `[ADD-WORLD-ACTORS-HERE]` token in CONVERSATIONS.NAME that rendered as a dangling `matching )` (and could have dumped the whole world-actors list into that sentence via `String.replace` first-match). The breadcrumb now ends at the envelope `area` (the clean leaf) instead of the prefixed `scenetitle`, and does not append `blocks.area.title` on top of `area` (they normally match, which would duplicate the leaf) — stated in the prompt and applied in the parser's fallback breadcrumb (single leaf `area || areaTitle || sceneTitle`). Also: OMIT BLOCKS now lists `blocks.area.title` as required, and a line documents the `area` / `area.title` / `scenetitle` relationship ("the ordering prefix comes from context — do not invent one").


## [13.8.1]

### Changed

- **JSON import — "Generate JSON Template" tab + progress overlay** (`scripts/window-json-import.js`, `scripts/registry-json-import-journals.js`, `scripts/utility-rolltable-import-lists.js`, `styles/window-json-import.css`): Renamed the **Copy Prompt** tab to **Generate JSON Template**. Building an Area Narrative prompt with compendium catalogs can be slow, so the window now shows a dimmed "working" overlay with a spinner during Copy / Save / Import. An `onProgress` callback is threaded from the window through `buildJournalPrompt` → `applyAreaCatalogSections` → `getCompendiumActorsList`/`getCompendiumItemsList`, updating the overlay per compendium (e.g. "Scanning actors — dnd5e: Monsters (SRD) (1/2)…") and yielding a frame so the UI repaints instead of appearing frozen. The spinner uses a module-owned CSS keyframe so it doesn't depend on `fa-spin`.

- **Area journal — `blocks.area.title` now required** (`prompts/prompt-journal-profile-area.txt`): The area import prompt now **requires** generators to set `blocks.area.title` explicitly instead of reusing `scenetitle`. `scenetitle` is the page/tab label and often carries an ordering prefix (e.g. "02 Main Room"); `blocks.area.title` is the clean on-page heading with that prefix stripped ("Main Room"). SCHEMA LOCK, the BLOCKS reference, the wrong→correct hints, and the USAGE checklist were updated to mark it REQUIRED and to show the prefix-stripping example. The parser's `blocks.area.title → scenetitle → area → "Area"` fallback is unchanged, so JSON without the field still imports gracefully.

- **JSON import — "Default" checkboxes removed; entered values always remembered** (`scripts/registry-json-import-journals.js`, `scripts/window-json-import.js`, `templates/window-json-import-body.hbs`, `styles/window-json-import.css`): Dropped the three opt-in **Default** checkboxes (geography + narrative/character image). The Generate tab now always mirrors what the GM enters — narrative folder, realm/region/site/area, and image paths — to the campaign settings on Copy/Save, so they pre-fill next time. The functional **Image Placeholder** toggles are kept. Field reads are now scoped to the currently selected template so the area and location blocks (which share `realm`/`region`/… ids and are both always in the DOM) no longer overwrite each other's values.

### Fixed

- **Party context missing from Area/journal prompts** (`scripts/utility-json-import-prompts.js`): `applyCampaignPlaceholders` substituted campaign tokens but not the party tokens, so `[ADD-PARTY-NAME-HERE]`, `-SIZE-`, `-LEVEL-`, `-MAKEUP-`, `-CLASSES-` passed through unfilled in the Area prompt (location/character prompts substituted them in their own helpers). Party substitution is now centralized in `applyCampaignPlaceholders`, pulling from `CampaignManager.getPromptContext()` (derived from the configured party actors).

- **Party class/level detection** (`scripts/manager-campaign.js`): `getActorClasses`/`getActorLevel` read `system.classes` (a version-dependent derived shape) and missed classes on modern dnd5e characters, leaving Primary Classes (and the class parentheses in Party Makeup) blank. They now read embedded **class Items** first (`actor.items` of type `class`), with the previous paths as fallback. NPC-type party members legitimately contribute no class.


## [13.8.0]

### Added

- **GM Notes** (`scripts/manager-gmnotes.js`, `scripts/api-gmnotes.js`, `scripts/window-gmnotes.js`, `scripts/ui-gmnotes-sheet.js`, `styles/notes-gm.css`, `documentation/api/api-gmnotes.md`, `scripts/blacksmith.js`, `module.json`): GMs can attach private notes to any Foundry document. The data layer stores a versioned envelope (`{ schemaVersion, html, text, pinned, updatedAt }`) on the document's own flags (`flags["coffee-pub-blacksmith"].gmNotes`), addressed by document **UUID**, with a stripped plain-text mirror kept alongside the rich HTML for future search. It is exposed as a public API — `game.modules.get('coffee-pub-blacksmith').api.gmNotes` (`get` / `getHtml` / `getText` / `has` / `set` / `clear`) — and fires a `blacksmith.gmNotesChanged` hook on every write. Editing happens in a canonical **GM Notes** window built on Blacksmith's own `BlacksmithWindowBaseV2` + zone template (the same window infrastructure other Blacksmith/Squire windows use), with a real ProseMirror editor and standard Save/Cancel action-bar buttons. On dnd5e item sheets a GM-only, read-only **GM Notes** card is injected alongside the native description cards (matching their look and collapse behavior); its feather opens the editor window, and the card live-refreshes on save. The card defaults to collapsed when empty, remembers its collapse state per-user (stored on a `game.user` flag), and expands automatically when content is added. v1 scope is **Items**; the API and editor window are document-agnostic so Actors and Journals reuse the same window. Storage is intentionally UI-gated (flags), not encrypted — players never see the section in the UI. See `documentation/api/api-gmnotes.md`.

- **GM Notes — item import support** (`scripts/parsers/parse-item.js`, `scripts/manager-gmnotes.js`, `prompts/prompt-item-core.txt`, `test-data/import-json/item-import-loot.json`): The item JSON importer now accepts an optional `itemGMNotes` HTML string and bakes it into the created item's GM Notes flag. A new `GMNotesManager.buildEnvelope()` constructs the note envelope (schema version + text mirror) so importer-created notes match hand-authored ones. The item import prompt (`prompt-item-core.txt`) documents the optional `itemGMNotes` field — GM-only secrets/plot hooks/"reveal after…" guidance, never shown to players — and the field is fully optional (omitted or empty imports nothing).


## [13.7.16]

### Added

- **Creature-type / subtype token naming** (`resources/naming-taxonomy.json`, `scripts/utility-token-naming.js`, `scripts/manager-canvas.js`, `scripts/settings.js`, `scripts/blacksmith.js`, `lang/en.json`): Token auto-renaming can now draw names appropriate to a creature's type/subtype instead of one global table. A new **Names by Creature Type** settings group adds an optional RollTable dropdown per creature type (the 14 official types) and per distinct subtype (`elf`, `dwarf`, `gnome`, `goblinoid`), generated from `resources/naming-taxonomy.json`. At token creation the table is resolved by a specificity-aware cascade — **subtype field → specific name keyword → type field → the global Random Name Table** — so unset entries fall through and existing behavior is unchanged until a per-type table is assigned. The name rung matches only **specific** keys (subtypes + roles like `cultist`/`thug`), skipping the 14 broad creature types, so a generic word never beats a role (e.g. "Human Cultist" → cultist, "Goblin Boss" → goblinoid). Role categories work even when the creature type is just `humanoid`. The taxonomy JSON maps aliases (e.g. `orcs`/`orcish`/`kobold` → `goblinoid`) to canonical keys; `human`/`halfling`/`goliath`/`commoner`/`merchant` intentionally ride the `humanoid` table. `type.custom` is honored for custom-typed creatures. Everything — the category list/dropdowns, aliases, and broad-vs-specific tiers (via each entry's `kind`) — is derived from the JSON, with no hardcoded lists. GMs can point at their own taxonomy file via the **Naming Taxonomy (JSON)** setting (browse button; defaults to the bundled file; reloads to rebuild the category list).


## [13.7.15]

### Added

- **JSON import — Save as Text File** (`scripts/window-json-import.js`, `scripts/registry-json-import.js`, `scripts/registry-json-import-journals.js`, `scripts/registry-json-import-items.js`, `scripts/registry-json-import-rolltables.js`, `scripts/blacksmith.js`): The Copy Prompt tab now has a **Save as Text File** button next to Copy to Clipboard, for prompts too large to reliably round-trip through the clipboard. Refactored the import-kind contract from `onCopyTemplate` (build + copy) to `onBuildPrompt` (build + return), so the window owns delivery and both Copy and Save reuse the same prompt-building path across all import kinds (journal, item, roll table, actor). Download uses `foundry.utils.saveDataToFile` so it works inside Foundry's Electron shell.

### Changed

- **Area Narrative prompt — per-compendium sourcing** (`scripts/registry-json-import-journals.js`, `scripts/utility-json-import-compendium-lists.js`, `scripts/utility-rolltable-import-lists.js`, `scripts/window-json-import.js`, `templates/window-json-import-body.hbs`, `styles/window-json-import.css`): Replaced the single **Include compendium actors** / **Include compendium items** checkboxes with **Compendium Actors** and **Compendium Items** sections, each listing one checkbox per configured compendium so the GM chooses exactly which compendiums to source from. Only selected compendiums' catalogs are injected into the prompt. Checkbox labels include the source package (e.g. `dnd5e: Monsters (SRD)`), matching the settings format. The **world actors / items** checkboxes moved into their own **World** section, stacked one per line. `getCompendiumActorsList` / `getCompendiumItemsList` now accept an optional pack-id subset (defaulting to all configured, so the roll table importer is unaffected).

- **Portrait facets — categorized layout and dropdowns** (`scripts/registry-json-import-journals.js`, `scripts/window-json-import.js`, `templates/window-json-import-body.hbs`, `styles/window-json-import.css`): Portrait Image facets are now grouped under **Identity**, **Species & Role**, and **Appearance** sub-headers. Categorical facets (Gender, Age, Creature race, Creature class, Physique, Expression) use dropdowns with curated option lists; Name, Hair, and Skin stay free-text; **Prop** is a 3-line text area. Prompt fields gained optional `group`/`rows` support; the Illustration template is unchanged.

- **Area journal — `preparation.threats` renamed to `preparation.actors`** (`prompts/prompt-journal-profile-area.txt`, `prompts/prompt-journal-core.txt`, `scripts/parsers/parse-journal-area.js`, `test-data/import-json/journal-import-area.json`): The preparation `threats` field is now `actors` and renders under an **Actors** heading. Its meaning broadened from "threats only" to the full scene roster — generic monster/NPC types (exact catalog names, e.g. `Goblin`, `Commoner`, for linking) **and** named individuals worth calling out in the narrative (e.g. `Bob the Barber`, `Phil the Terrible — a named goblin`), which may also appear in `conversations`. The prompt guidance and examples were updated accordingly. The parser still accepts the legacy `threats` key as an alias so previously generated JSON imports unchanged.

- **Area journal — optional `blocks.area.title`** (`prompts/prompt-journal-profile-area.txt`, `scripts/parsers/parse-journal-area.js`, `test-data/import-json/journal-import-area.json`): Added an optional `blocks.area.title` string so the on-page area heading can differ from the scene/page name. The area section `<h2>` resolves `blocks.area.title` → `scenetitle` → `area` → `"Area"`; omitting it preserves existing behavior. It is a sibling of `narrative`/`narrativecard` (the prompt's SCHEMA LOCK keeps `narrative` as exactly three strings and forbids a `title` inside it). *(Made required in 13.8.1.)*

- **Area journal — section spacing preserved in the editor** (`scripts/utility-journal-html.js`, `scripts/utility-common.js`, `templates/journal-area.hbs`): Foundry's editor strips empty `<p></p>` separators, collapsing section spacing. New `applyJournalHeadingSpacing` inserts spacers that survive — `<p>&nbsp;</p><hr><p>&nbsp;</p>` before each top-level H1/H2 and a single `<p>&nbsp;</p>` before each top-level H3–H6 (headings nested in blockquotes and the first element on the page are left alone). The area template no longer emits the manual `<p></p>` separators.

## [13.7.14]

### Changed

- **module.json**: Added upload flag to allow uploads to the module folder.

## [13.7.13]

### Added

- **Session timer — Default Time modes** (`scripts/settings.js`, `scripts/api-menubar.js`, `scripts/utility-session-timer.js`, `lang/en.json`): New **Default Time** world setting with **None**, **Fixed Duration**, or **Specific Time**. Renamed the duration slider to **Fixed Duration**; added **Specific Time** dropdown (half-hour increments, shared with the menubar). On load, the GM client applies the configured default when the previous timer is from another day or expired (`getSettingSafely` for timing-safe reads). Saving Default Time settings updates the menubar immediately when no session timer is already running (`settingChange` hook). Menubar **Set Time** presets and end-time dialog now include half-hour slots (e.g. 8:00 PM, 8:30 PM).

- **Leader menubar menu — Vote for Leader** (`scripts/api-menubar.js`): GM leader dropdown now includes **Vote for Leader** at the top to start the same leader vote as **Start a Vote → Select a Leader**, without opening the vote window.

### Changed

- **Leader menubar menu icons** (`scripts/api-menubar.js`): Party leader dropdown now shows a **crown** on the current leader and a **user** icon on all other player entries (replacing crown-on-everyone with a checkmark on the leader).

### Fixed

- **Chat card roll buttons unclickable** (`scripts/window-skillcheck.js`): Clicking a `.cpb-skill-roll` button in a skill check chat card did nothing for all users. The compat shim in `blacksmith.js` adds a `.find()` method to the raw `HTMLElement` passed by the v13 `renderChatMessageHTML` hook so that legacy code expecting jQuery can still call it. The jQuery-normalization check in `handleChatMessageClick` tested `typeof html.find === 'function'`, which was `true` for the shimmed element, causing it to take the jQuery unwrap branch (`html[0]`), receive `undefined`, and silently return before attaching any click handlers. Fixed by checking only `html?.jquery` — the property jQuery itself sets — which the compat shim never touches.

- **Cinematic roll hourglass for unlinked token owners** (`scripts/window-skillcheck.js`): Players who owned a base actor but whose token was unlinked saw a spinning hourglass instead of dice buttons in the cinematic overlay. For an unlinked token, `token.actor` returns a synthetic actor that evaluates token-document ownership rather than base-actor ownership, so `actorDocument?.isOwner` returned `false` even though the player owned the character. Fixed by always resolving the base actor via `game.actors.get(actor.actorId)` for the `hasPermission` check, keeping `actorDocument` only for image resolution.

- **Journal page pin targets wrong page** (`scripts/ui-journal-pins.js`, `scripts/manager-journal-dom.js`, `scripts/ui-journal-encounter.js`): Pinning page 2 of a multi-page journal would instead pin page 1 — and appear to move the existing page 1 pin — because `querySelector` with a comma-separated selector returns the first **DOM-order** match of any alternative, not the first alternative that matches. `article.journal-entry-page:not([style*="display: none"])` matched page 1 before page 2 could match `.active`, so every call to `_getActivePageIdFromSheet` returned page 1 regardless of which page was actually selected. Fixed all five call sites by splitting the combined selector into two sequential queries: `.active` is checked first, and only if no active page is found does it fall back to the first visible page. The pin button click handler in `ui-journal-pins.js` was also hardened to read the live active page from the DOM at click time rather than relying on the `data-page-id` attribute cached on the toolbar, which could be stale if the watchdog interval had not yet fired since the last page navigation.

## [13.7.12]

### Changed

- **Timer feature gating** (`scripts/timer-round.js`, `scripts/timer-planning.js`, `scripts/timer-combat.js`): All three timers now skip hook registration and interval startup entirely when disabled. Round and combat timers gate inside `Hooks.once('ready', ...)` using `getSettingSafely` with fallback `true` (matching the setting defaults). Planning timer restructured so all `HookManager` registrations are inside the gated `ready` callback — no hooks fire at all when the feature is off.

- **Timer enable/disable requires reload** (`scripts/settings.js`): `showRoundTimer`, `planningTimerEnabled`, and `combatTimerEnabled` now have `requiresReload: true` so Foundry prompts for a reload when any of them are toggled, since hooks only register at startup.

### Fixed

- **Planning timer reload / first-paint state** (`scripts/timer-planning.js`, `templates/timer-planning.hbs`): Refreshing the client during round-top planning could render a broken planning row with `0S PLANNING`, an empty bar, and paused/zero state that ignored `planningTimerAutoStart` until the window repainted or focus changed. Reload during valid planning now rebuilds a fresh planning timer from settings, uses safe setting reads during early lifecycle timing, avoids duplicate planning-start side effects on reload, and renders the initial planning text/bar directly from current timer state so the first paint is correct.

- **Combat timer silent init crash** (`scripts/timer-combat.js`): `combatTimerEnabled` and `combatTimerDuration` used `game.settings.get()` inside a `Hooks.once('ready', ...)` that fired before settings were registered, crashing silently and leaving all combat timer hooks (including the token-movement-ends-planning trigger) unregistered. Switched to `getSettingSafely`. Also added `getSettingSafely` to the import from `api-core.js`.

- **Combat timer render crash** (`scripts/timer-combat.js`): `combatTimerEnabled` and `combatTimerGMOnly` in `_onRenderCombatTracker` also used raw `game.settings.get()` which could throw before settings were registered. Switched to `getSettingSafely`.

- **Planning timer `verifyTimerConditions` fallback** (`scripts/timer-planning.js`): The `getSettingSafely` call for `planningTimerEnabled` inside `verifyTimerConditions` used fallback `false`, which silently blocked `startTimer()` when settings were not yet registered (e.g., on the first render after ready). Changed fallback to `true` to match the setting default.


## [13.7.11]

### Added

- **Menubar Settings / Refresh visibility** (`scripts/utility-core.js`): The Settings and Refresh items in the hamburger context menu now respect `menubarShowSettings` and `menubarShowRefresh` — toggling either setting hides or shows the item on next menu open.

### Fixed

- **Combat timer silent initialization crash** (`scripts/timer-combat.js`): `combatTimerEnabled` and `combatTimerDuration` were read with `game.settings.get()` inside a `Hooks.once('ready', ...)` callback that fires before settings are registered. The call threw, was caught silently, and aborted initialization — leaving all combat timer hooks (including the token-movement-ends-planning trigger) unregistered. Switched to `getSettingSafely` with fallback `true` / `60`. Also added `getSettingSafely` to the import from `api-core.js`.

- **HookManager `pre*` hook cancellation** (`scripts/manager-hooks.js`): Returning `false` from a callback now correctly cancels the action for any `pre*` hook, not only `preUpdateToken` as before.

## [13.7.10]

### Added

- **Clarity / Quickview mode** (`scripts/utility-quickview.js`): GM-only local vision aid that boosts scene brightness (via the core illumination shader `gmVision` uniform and darkness layer alpha), makes fog of war nearly transparent, and outlines tokens outside the current vision polygon or hidden from players with a configurable sight-highlight ring. Toggle via the menubar hamburger menu or `Ctrl+Q` keybinding. GM-only — player clients see no change. Deactivates automatically on scene change and restores all original values on toggle-off.

- **Hide Initiative Roll Chat Cards** (`scripts/blacksmith.js`, `scripts/settings.js`): New world setting **Hide Initiative Roll Cards** (Run the Game group). When enabled, initiative roll cards are hidden immediately on render and deleted after the Dice So Nice animation completes (or immediately if DSN is not active) — 3D dice still animate, initiative still resolves and appears in the combat tracker, the card just never clutters the chat log.


- **Menubar Settings / Refresh visibility** (`scripts/utility-core.js`): The Settings and Refresh items in the hamburger context menu now respect `menubarShowSettings` and `menubarShowRefresh` — toggling either setting hides or shows the item immediately on next menu open.

### Fixed

- **HookManager `pre*` hook cancellation** (`scripts/manager-hooks.js`): Returning `false` from a callback now correctly cancels the action for any `pre*` hook (e.g. `preCreateChatMessage`, `preCreateToken`), not only `preUpdateToken` as before.

- **Compatibility shims removed** (`scripts/common.js`, `scripts/journal-page-pins.js`, `scripts/window-base-v2.js`): All three post-rename shim files deleted after confirming no external consumers. `coffee-pub-minstrel` `window-minstrel.js` was the sole remaining consumer of `window-base-v2.js` and has been updated to import from the canonical `window-base.js` path.

- **Dead token-to-loot scaffold removed** (`scripts/manager-canvas.js`): Removed `_initializeTokenConversion()` stub and its call from `CanvasTools.initialize()`. Full implementation lives in `coffee-pub-curator`; the Blacksmith stub was leftover scaffolding.

- **Movement sound loop infrastructure removed** (`scripts/token-movement.js`): Removed unused watcher/looping system (5 Maps, 5 constants, `ensureMovementSoundWatcher`, `clearMovementSoundWatcher`, `stopMovementSoundForToken`). Play-once-per-update behavior is intentional — continuous looping was tried and discarded as disruptive.

## [13.7.9]

### Added

- **Pin layer ordering — Bring to Front / Bring Forward / Send Backward / Send to Back** (`scripts/pins-renderer.js`, `scripts/manager-pins.js`, `scripts/pins-schema.js`): Right-click a pin to access the new **Layer** flyout (same `canEdit` guard as Configure Pin). Four actions control z-order stacking: **Bring to Front** jumps to the highest order across all scene pins; **Bring Forward** nudges up by one step; **Send Backward** nudges down by one step; **Send to Back** jumps to the lowest order. Order is stored as a numeric `order` field on each pin (default `0`) and applied as CSS `z-index` on every render, so stacking persists across reloads and syncs to all connected clients.

### Changed

- **Pin context menu order** (`scripts/pins-renderer.js`): Core items reordered to: Bring Players Here → Configure Pin → Animate → Layer → Pin Visibility → Pin Editing → Delete Pin. Removed **Ping Pin** item.


## [13.7.8]

### Fixed

- **Cinematic roll — players see hourglass instead of dice buttons** (`scripts/window-skillcheck.js`): `createActorCardHtml` now falls back to `game.actors.get(actor.actorId)` when the canvas token lookup fails. Previously, if a token was not found on the canvas, `actorDocument` was `null`, causing `actor.isOwner` to return `undefined` and every player to see the waiting hourglass instead of their roll dice. The fallback also restores correct portrait images for actors without a canvas token.

## [13.7.7]

### Added

- **Journal image prompts (split from narrative import)** (`prompts/prompt-journal-visual-core.txt`, `prompt-journal-visual-illustration.txt`, `prompt-journal-visual-portrait.txt`, `scripts/registry-json-import-journals.js`): **Illustration Image** and **Portrait Image** are separate Import JSON copy targets (core + profile composed on copy). **Area Narrative** stays JSON-only (`prompt-journal-core.txt` + area profile). Replaces merged `prompt-journal-visual-styles.txt` (archived).
- **Location Narrative import** (`prompt-location.txt`, `registry-json-import-journals.js`): Encyclopedia **JSON-only** copy; card art via **Illustration Image**. Import JSON prefills folder, journal, title, geography, image path, and **Additional context** (prompt-only, not a JSON field).
- **Illustration Image prefills** (`prompt-journal-visual-illustration.txt`, `registry-json-import-journals.js`, `window-json-import-body.hbs`): Subject type (including **Character (in scene)**, nautical, and place types), season, time of day, full-width description, and `[ADD-ILLUSTRATION-*]` substitution; aspect-ratio rules from subject type (16:9 vs 1:1 for object/artifact).
- **Import JSON window — journal tabs** (`window-json-import-body.hbs`, `window-json-import.js`, `window-json-import.css`, `window-template.hbs`): **Copy Prompt** / **Import JSON** in the canonical tools zone (Manage Pins pattern); per-tab footer (**Copy to Clipboard** primary vs **Select JSON File** + **Import JSON**); form state preserved when switching tabs.
- **Manage Pin Layers: "Dim hidden" toggle** (`scripts/window-pin-layers.js`): Controls how hidden sections appear in the Layers window only (not on canvas). On (default): dimmed sections remain visible; off: hidden sections are omitted for a cleaner list. Preference persists with window bounds.
- **Auto-unhide layer on pin place/create** (`scripts/manager-pins.js`): Placing or creating a pin on the active scene unhides its layer type when the filter had it hidden, so new pins are visible immediately.
- **Manage Pin Layers: unregistered pin types** (`scripts/window-pin-layers.js`): Layers tab adds groups for `(moduleId, type)` pairs on the scene that lack taxonomy registration, using tags from actual pins.
- **`registerPinTaxonomy` bulk format** (`scripts/manager-pins.js`): Accepts `registerPinTaxonomy(moduleId, { pinCategories: { type: { label, tags } } })` in addition to the per-type overload; fixes `[object Object]` group labels when callers pass the full taxonomy object as `type`.
- **Delete-by-type in Manage Pin Layers** (`scripts/window-pin-layers.js`): GM trash control on each taxonomy header removes all pins of that module+type from the current scene (with confirmation).
- **Rectangle pin shape** (`scripts/pins-schema.js`, `scripts/pins-renderer.js`, `scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`, `styles/pins.css`): Rounded corners like `square`, free aspect ratio like `none`; independent width and height with fill, stroke, and shadow.
- **Pin size: single input with aspect-ratio support** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`): One **Size** field; `circle`/`square` lock height to width; `rectangle`/`none` with an image URL derive height from the image aspect ratio. `lockProportions` no longer written (legacy values ignored).

### Changed

- **Area journal layout** (`templates/journal-area.hbs`, `styles/overrides-foundry.css`): Spacing between major blocks (preparation, area, encounter, conversations) and heading/list margins so narrative cards do not run into the next section.
- **Journal narrative prompts** (`prompts/prompt-journal-core.txt`, `prompts/prompt-journal-profile-area.txt`): JSON-only first reply; SERIALIZATION CONTRACT / SCHEMA LOCK; conversations ordering and naming rules (personal names or diegetic handles, not bare role tokens); `imagetitle` as short UI caption; images out of scope for narrative copy.
- **Journal visual prompts** (`prompts/prompt-journal-visual-*.txt`): Shared core for expectations; illustration and portrait profiles hold full ink-and-wash contracts; closing lines instruct the model to **generate the image**, not only output prompt text.
- **Illustration copy** (`prompt-journal-visual-illustration.txt`, `registry-json-import-journals.js`): Restored working **NARRATIVE ILLUSTRATION IMAGE** contract; illustration compose no longer pulls visual core or cinematic style bloat; single **Copy to Clipboard** on the copy tab.
- **Portrait copy** (`prompt-journal-visual-portrait.txt`, `registry-json-import-journals.js`): Visual core + portrait profile; **Portrait facets** prefills on Import JSON.
- **Additional context (Area + Location)** (`prompt-journal-profile-area.txt`, `prompt-location.txt`, Import JSON UI): Renamed from “GM context”; shared textarea prefills copy prompts only.
- **Journal Import JSON — compendium checkboxes** (`registry-json-import-journals.js`, `window-json-import.js`): Actor/item “append to prompt” options only for **Area Narrative**.
- **Import JSON — Location / Area UI** (`window-json-import-body.hbs`, `window-json-import.css`): Removed card-art helper text; relaxed location-path field widths; import tab uses a full-height paste area (no nested section box); placeholder references **Select JSON File** below.
- **GM indicator badge** (`scripts/pins-renderer.js`, `styles/pins.css`): Fixed canvas-relative size (16 scene units × scale) so large image pins do not get oversized badges.
- **`pins.place()` / `pins.update()` messaging** (`scripts/manager-pins.js`): User-visible toast on placement failure; consistent `postConsoleAndNotification` for not-found update paths.
- **Journal pin placement** (`scripts/ui-journal-pins.js`): Live `findScene()` at click time; flags written only after successful place; `unplace` failure falls back to `update` instead of a bad `place`.
- **Drop handler size by shape** (`scripts/blacksmith.js`): `dropCanvasData` normalizes `size` — `circle`/`square` force `h = w`; `rectangle`/`none` keep dropped height.

### Fixed

- **Unplaced pins dropped on read-back** (`scripts/pins-schema.js`): `migrateAndValidatePin` now validates unplaced pins with `{ allowUnplaced: true }`, fixing first-time journal placements that failed with “Pin not found”.
- **`rectangle` coerced to `circle`** (`scripts/pins-schema.js`): `applyDefaults` includes `'rectangle'` in valid shapes.
- **Migration write race** (`scripts/manager-pins.js`): `_setUnplacedPins` waits for `_pendingMigrationWrite` so create/unplaced store writes cannot be overwritten by a stale migration snapshot.
- **Stray `reload()` after journal pin placement** (`scripts/ui-journal-pins.js`): Removed redundant `pins.reload()` after create/place on the active scene.
- **`_canEdit` console flood** (`scripts/manager-pins.js`): Removed per-mousedown `console.debug` for non-owners.

### Documentation

- **Pins API** (`documentation/api/api-pins.md`): `rectangle` shape, `size` semantics by shape, drop-data `shape` and normalization, legacy `lockProportions` note, CSS example correction (`0.24` → `0.22`).

## [13.7.6]

### Added

- **Unified item JSON import prompts** (`prompts/prompt-item-core.txt`, `prompts/prompt-item-partial-artificer.txt`, `prompts/prompt-item-profile-*.txt`, `scripts/utility-json-import-prompts.js`, `scripts/registry-json-import-items.js`): Item directory Import composes **core + profile** (Loot, Consumable, Weapon, Equipment, Tool, Container). When Coffee Pub Artificer is active, an **Artificer Item** checkbox appends the artificer partial + add-on instructions (any item type + `flags["coffee-pub-artificer"]`). Replaces separate loot/consumable/artificer monolith prompts for clipboard copy.
- **JSON import registry (Phase 2)** (`scripts/registry-json-import.js`, `scripts/parsers/parse-item.js`): Shared `registerJsonImportKind`, `attachJsonImportButton`, `parseJsonImportPayload`, and `JsonImportWindow` wiring. Item kind registers in `registry-json-import-items.js`.
- **Roll table JSON import (Phase 3)** (`prompts/prompt-rolltable-core.txt`, `prompts/prompt-rolltable-profile-*.txt`, `scripts/registry-json-import-rolltables.js`, `scripts/parsers/parse-rolltable.js`, `scripts/utility-rolltable-import-lists.js`): Roll table directory uses the same registry pattern as items (core + profile prompts, six template types). Legacy monolith `prompt-rolltable-*.txt` files moved to `prompts/archive/`. **Core** holds the single JSON template and shared field/build rules; **profiles** only set defaults (resultType, document type), build notes, and injected lists.
- **Pin permission icon map** (`scripts/pin-permission-icons.js`): Single source of truth for Font Awesome classes used by **Pin editing** (`user-shield` → GM only, `user-pen` → Owner, `users` → Everyone) and **Pin visibility** (`eye`, `eye-slash`). `pinIconTag()` for context menu HTML. Context menu **Pin editing** parent row uses `shield-halved`.
- **Canvas pin editing indicators (GMs only)** (`scripts/pins-renderer.js`): Corner glyph on pins when editing is GM-only (`user-shield`) or Owner (`user-pen`). Players never see these icons.
- **`pinsNeedStorageUpdate()`** (`scripts/pins-schema.js`): Detects when migrated pin data should replace stored scene/unplaced flags (schema version, legacy `group`, `journal-page` type, `owner` visibility, or dropped invalid pins).

### Changed

- **Item Import UI** (`scripts/blacksmith.js`, `templates/window-json-import.hbs`): Template dropdown is six D&D item types only; **Artificer Item** checkbox (when `coffee-pub-artificer` is active) controls the artificer partial on copy. Directory hook uses `attachJsonImportButton(html, 'item')`. Parsing and image heuristics moved to `scripts/parsers/parse-item.js`.
- **Legacy item prompts archived** (`prompts/archive/`): `prompt-items-loot.txt`, `prompt-items-consumables.txt`, and `prompt-artificer-item.txt` moved out of the active prompts folder (see `prompts/archive/README.md`).
- **Roll table Import UI** (`scripts/blacksmith.js`): `renderRollTableDirectory` uses `attachJsonImportButton(html, 'rolltable')`; parsing and compendium/world list injection moved out of `blacksmith.js`.
- **Pin editing + pin visibility (schema v7)** (`scripts/pins-schema.js`, `scripts/pins-renderer.js`, `scripts/window-pin-configuration.js`, `scripts/ui-journal-pins.js`, `scripts/window-pin-layers.js`, `templates/window-pin-config.hbs`, `templates/toolbar-pins.hbs`, `styles/pins.css`): Renamed UI **Access** → **Pin editing** and **Player Visibility** → **Pin visibility**. Stored values: `config.blacksmithAccess` (`gm` | `private` | `public`) and `config.blacksmithVisibility` (`visible` | `hidden` only). **`hidden`** removes the marker from the map for other players who can view the pin; **GMs always see all pins**; **pin owners** always see their own pins when hidden. Removed **`owner`** visibility mode and withheld/dimmed player rendering (legacy `owner` migrates to `visible`). Pin visibility controls are **GM-only** (journal toolbar visibility toggle hidden for players; players force `visible` on place). **Owner** pin editing blocks mousedown for non-editors on the marker shell; **GM only** editing still delivers click events (calling modules must gate content). Solo-player markers: use `ownership.users`, not a visibility mode.
- **Pin schema migration persist (GM)** (`scripts/manager-pins.js`): Scene and **unplaced** pins run `migrateAndValidatePins` on read; GMs persist upgraded data to scene flags or the unplaced world setting when storage is behind schema (not only when invalid pins are dropped). Once per scene/unplaced per session to avoid repeated writes.
- **GM hidden-pin preview** (`scripts/pins-renderer.js`): Pins with `blacksmithVisibility: 'hidden'` render at **50% opacity** on the GM canvas (`data-gm-hidden`); players do not see the marker.

### Fixed

- **Hidden pin GM opacity** (`scripts/pins-renderer.js`): Restored half-opacity canvas preview for GMs after the visibility refactor had dropped dimming while keeping player markers off the map.

### Documentation

- **Pins API** (`documentation/api/api-pins.md`): **Pin editing and pin visibility** section — marker vs document contract, behavior tables, GM indicator notes, wiki cross-link.
- **Module author brief** (`documentation/guides/developer-note-pin-editing-visibility.md`): Self-contained integration note for other Coffee Pub modules (no Blacksmith repo required). Checklist, code patterns, legacy mapping, hooks, and testing scenarios. Pair with public wiki [API: Pins](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).
- **Pin migration guide** (`documentation/guides/guide-pin-migration.md`): 13.7.6 summary, checklist, and link to the module author brief + wiki.
- **Architecture pins** (`documentation/architecture/architecture-pins.md`): Migration persist and unplaced migrate-on-read behavior.

### For other Coffee Pub module authors

- Read `documentation/guides/developer-note-pin-editing-visibility.md` and the wiki [API: Pins](https://github.com/Drowbe/coffee-pub-blacksmith/wiki/API:-Pins).
- Stop using `blacksmithVisibility: 'owner'`; do not assume hidden pins are dimmed for players.
- Gate journal/quest/note opens in your **click** handlers; pin visibility controls the **marker** only.

## [13.7.5]

### Added

- **Manage Pin Layers profile dropdown organization** (`scripts/window-pin-layers.js`): Reordered the profile dropdown into **+ New Profile**, **System**, and **Custom** sections. Creating profiles now starts from the dropdown, while custom profile updates/deletes remain contextual to the selected custom profile.
- **Manage Pin Layers taxonomy labels** (`scripts/window-pin-layers.js`): Renamed taxonomy subsection labels from **Predefined** to **System** for consistency with the profile dropdown and built-in tag language.

## [13.7.4]

### Documentation

- **Pins API — `reconcile()` clarified** (`documentation/api/api-pins.md`): Added explicit callout that `reconcile()` mutates the items array in memory but does not persist to Foundry flags — callers must write back to scene flags after the call or orphaned references reappear on the next reload. Added intended-pattern note directing developers to call `reconcile()` at scene-load time and use deletion hooks for real-time cleanup.
- **Pins API — deletion hook coverage gap documented** (`documentation/api/api-pins.md`): Clarified that `blacksmith.pins.deleted` does not fire for bulk deletions via `deleteAll()` or `deleteAllByType()` — only `blacksmith.pins.deletedAll` / `blacksmith.pins.deletedAllByType` fire in those cases. Added a full-coverage pattern showing all three hooks wired together with a `reconcile()` pass inside the bulk handlers.
- **Pins API — `imageFit` and `imageZoom` added to PinData** (`documentation/api/api-pins.md`): Documented the `imageFit` (`'fill' | 'contain' | 'cover' | 'none' | 'scale-down' | 'zoom'`, default `'cover'`) and `imageZoom` (scale multiplier for `'zoom'` fit, default `1`, clamped `1–2`) fields that control how image URLs render inside the pin element. Both fields are ignored for Font Awesome icons.
- **Pins API — `reload()` guidance corrected** (`documentation/api/api-pins.md`): Clarified that `pins.reload()` is not required after `create()`, `place()`, or `update()` on the currently active scene — those calls update the renderer automatically. `reload()` is only needed when the Blacksmith layer container has not yet been initialized (layer never activated since page load). Updated the `place()` description, the `reload()` method description, and five usage examples that incorrectly showed `await pins.reload()` after normal CRUD operations.


## [13.7.3]

### Added

- **Manage Pins window taxonomy controls** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`, `scripts/manager-pins.js`): Added section-level visibility toggles so GMs can hide or show whole pin groups such as Global, Custom, and registered pin categories, not just individual tags. Type-scoped tag visibility is now saved in visibility profiles via `hiddenTypeTags`.
- **Manage Pin Tags bulk selection flow** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Added browse-tab select mode with row checkboxes, selected count, **Select Visible**, **Clear**, and **Bulk Edit Tags** actions in the window action bar. The **Done** control remains in the top toolbar.
- **Bulk Edit Pin Tags Application V2 window** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Added a resizable Blacksmith V2 bulk tag editor for selected pins. It starts with the union of all selected pin tags, shows tag chips with per-selection counts, supports typed tag entry, and includes **Update** plus **Delete All Tags** actions.
- **Manage Custom Pin Tags Application V2 window** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`, `scripts/manager-pins.js`, `scripts/api-pins.js`): Added a dedicated GM window for custom pin tag administration. It lists custom tags with current-scene usage, global usage, and pin types, and supports **Rename**, **Scene**, **All Scene**, and icon-only delete actions with `data-tooltip` explanations.
- **Registry-only custom pin tags** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`, `scripts/api-pins.js`, `documentation/api/api-pins.md`): Added **Add** support in Manage Custom Pin Tags for adding one or more comma-separated tags to the registry without assigning them to pins. New API methods include `addTagToRegistry`, `stripTagFromScene`, and `stripTagFromAllScenes`.
- **Manage Pin Layers — Hide unused** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Layers-tab toggle on the profile row hides tag chips that have zero pins on the current scene while keeping every taxonomy group visible. Empty System/Custom areas show a short hint when the toggle is on. The choice is stored in `pinLayersWindowBounds.layersHideUnused` (client preference, not part of saved visibility profiles).

### Changed

- **Pin manager naming and layout** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Renamed **Pin Layers** to **Manage Pins**, **Layers** to **Manage Pin Layers**, and **Browse** to **Manage Pin Tags**. Tabs and search/profile controls now render as separate tool rows with their own padding and divider.
- **Manage Pin Layers scope cleanup** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Removed the pencil/manage mode and global tag mutation controls from the layer taxonomy tab so the tab now focuses on visibility only. Custom tag mutations moved into the dedicated Manage Custom Pin Tags window.
- **Manage Pin Layers global taxonomy grouping** (`scripts/window-pin-layers.js`): Consolidated the separate top **Global** and bottom **Custom** tag groups into one **Global** section with **System** and **Custom** subsections, matching the layout used by registered pin categories.
- **Custom tag action labels** (`scripts/window-pin-layers.js`): Shortened custom tag row actions to compact labels: **Rename**, **Scene**, **All Scene**, and icon-only delete. Full explanations moved to `data-tooltip` attributes.
- **Bulk tag editor visual consistency** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Aligned bulk tag chips with the shared `.blacksmith-tag` styling used by the main pin manager tag clouds.
- **Tag registry operations preserve strip/delete distinction** (`scripts/manager-pins.js`): Strip actions remove tag usage while keeping the tag available in the registry; delete removes both usage and registry entries.
- **Manage Pin Layers profile workflow** (`scripts/window-pin-layers.js`, `styles/window-pin-layers.css`): Saved profiles now auto-apply when selected, replacing the ambiguous **Apply** button. The profile row now uses dropdown-based **+ New Profile**, conditional **Update**, a compact delete icon with confirmation, and an **Active / Unsaved Changes / Custom** status chip.
- **Manage Pin Layers built-in profiles** (`scripts/window-pin-layers.js`): Added permanent **All Pins** and **No Pins** system profiles to the profile selector. They apply immediately, cannot be updated or deleted, and map to the hide-list model: **All Pins** clears all hidden state, while **No Pins** hides all current pin layers/tags and uses hide-all so future pins remain hidden too.
- **Manage Pin Layers profile dropdown organization** (`scripts/window-pin-layers.js`): Reordered the profile dropdown into **+ New Profile**, **System**, and **Custom** sections. Creating profiles now starts from the dropdown, while custom profile updates/deletes remain contextual to the selected custom profile.
- **Manage Pin Layers taxonomy labels** (`scripts/window-pin-layers.js`): Renamed taxonomy subsection labels from **Predefined** to **System** for consistency with the profile dropdown and built-in tag language.
- **Pins menubar context menu** (`scripts/utility-core.js`, `scripts/api-menubar.js`): Replaced the legacy right-click pin menu with a focused set of actions: **Manage Pins**, **Hide All Pins**, **Show All Pins**, and **Load Profile** with saved custom profiles in a flyout. Bulk deletion and detailed pin-layer operations now live in the Manage Pins window.
- **Pin overlay filter sync** (`scripts/pins-renderer.js`): `applyVisibilityFilters` now drops stale in-flight work with a generation counter (bumped when the overlay clears), skips a full scene list when the loaded overlay scene id disagrees with the active `canvas.scene` until scene load aligns, and uses fast paths for global hide-all (bulk `removePin` only, no `PinManager.list` / per-pin `updatePin`) and for scenes with no listable pins (clear overlay without a per-pin update loop).

### Fixed

- **Manage UI Apply on Load timing** (`scripts/utility-core.js`): `Apply on Load` now re-applies when Foundry renders the target UI apps (`renderHotbar`, `renderSceneControls`, `renderPlayerList`) instead of relying only on startup hooks. The previous implementation could run before those interface regions existed, so the saved on-load hide state never affected items like the macro hotbar even though the hotkey and Manage UI action worked afterward.
- **Bulk tag editor tag coverage** (`scripts/window-pin-layers.js`): Bulk editing now accounts for all selected pin tags, including custom/non-taxonomy tags, so existing tags like scene-local custom tags appear in both the input and chip suggestions.
- **Global tag rename/delete cleanup** (`scripts/manager-pins.js`): Global rename and delete now also handle unplaced pins, type-scoped hidden tag state, and saved visibility profile snapshots.
- **Bulk editor chip interaction** (`scripts/window-pin-layers.js`): Hardened listener attachment so tag chips continue to toggle correctly when Application V2/Dialog root elements differ.
- **Manage Pin Layers profile state clarity** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`): Profile controls now more clearly represent the saved visibility snapshot: hide-all state, hidden categories, hidden global tags, and hidden type-scoped tags. Selecting **Custom / Current View** clears the active profile label without changing the current layer visibility.
- **Menubar profile synchronization** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`, `scripts/api-menubar.js`, `scripts/api-pins.js`): Manage Pins now prefers the active profile set by the menubar over stale window history. Profile application accepts scene context through the public pins API so saved profile repair logic can evaluate the correct scene.
- **No Pins profile customization** (`scripts/window-pin-layers.js`, `scripts/manager-pins.js`): Showing a category or tag after starting from **No Pins** now clears the global hide-all flag before un-hiding the chosen layer, preventing profiles that look visible in the manager while remaining hidden on the canvas. Older custom profiles with visible layer exceptions under hide-all are repaired on apply and can be updated afterward.
- **Manage Pins hook and timer cleanup** (`scripts/window-pin-layers.js`): Routed persistent Manage Pins lifecycle hooks through `HookManager`, limited scene-load profile refreshes to system profiles, and cleared pending browse-search debounce timers when the window closes.
- **Registered pin type filtering** (`scripts/manager-pins.js`, `scripts/window-pin-layers.js`): Type taxonomy tags such as Note, Codex, Quest, Objective, and Artificer component tags are now evaluated against their registered module/type visibility instead of being overridden by stale global hidden-tag state.
- **Pin visibility profile not updating the canvas immediately** (`scripts/pins-renderer.js`, `scripts/manager-pins.js`): After loading a profile that should reveal pins that were never added to the DOM (because they were filter-hidden at scene load), the overlay could stay empty until something else refreshed the canvas. `applyVisibilityFilters` now walks every pin in the active sync context with `updatePin` and removes DOM ids that no longer belong, and `applyVisibilityProfileState` awaits that pass so profile application and the Manage Pins window finish in step.

## [13.7.2]

### Added

- **Portrait Image Source setting for targeter portraits** (`settings.js`, `lang/en.json`, `manager-token-indicators.js`): New **Portrait Image Source** dropdown in the Targeted Indicator section lets GMs choose what image appears in the portrait bubble above a targeted token. Three options: **Character Portrait** (actor portrait image, default), **Character Token** (canvas token art), and **Player Avatar** (user avatar). Changing the setting live-redraws all portraits immediately.

### Changed

- **Targeter portraits now resolve from the controlled token, not just the assigned character** (`manager-token-indicators.js`): A new `controlToken` hook tracks the last token each user controlled on the canvas. Portrait images now derive from that source token rather than always using the user's primary assigned character. This means players who own multiple characters will see the correct portrait for whichever character they have selected, and the fallback chain (actor portrait → user avatar → mystery-man) still applies when no controlled token is found.

### Fixed

- **Target indicators persisted after token deletion** (`manager-token-indicators.js`): The `deleteToken` hook callback used the Foundry v10 signature `(scene, tokenData)` which in v11+ became `(tokenDocument, options)`. The second argument (options) has no `id`, causing the early-return guard to silently skip all cleanup. Ring graphics, ticker animations, and internal state all remained on the canvas after a token was deleted. Fixed by updating the callback to `(tokenDocument)` so cleanup runs correctly.

## [13.7.1]

### Added

- **Pin context menu — GM Access submenu** (`scripts/pins-renderer.js`): Added a GM-only **Access** submenu on pin right-click with `None: GM Only`, `Read Only: All open / GM Edit`, `Pin: All see pin / GM and Owner Edit`, and `Full: All view and edit`. Each action updates both `ownership.default` and `config.blacksmithAccess` so context-menu edits match Configure Pin behavior.
- **Pin visibility modes include Owner** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`, `scripts/pins-renderer.js`, `scripts/window-pin-layers.js`): Added `owner` as a third visibility mode (`visible` / `hidden` / `owner`) in Configure Pin, renderer visibility checks, right-click visibility submenu, and Pin Layers browse toggle cycle.

### Changed

- **Configure Pin permissions model decoupled into Access + Visibility** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`): Replaced legacy ownership labels with explicit access presets (`None`, `Read Only`, `Pin`, `Full`) and separate `Visibility` control (`Visible`, `Hidden`, `Owner`). Access presets map to Foundry ownership + `blacksmithAccess` runtime mode.
- **Pin Layers browse visibility toggle cycles all three states** (`scripts/window-pin-layers.js`): Browse row visibility action now rotates `Visible -> Hidden -> Owner -> Visible` with matching icon/title updates.

### Fixed

- **GM-only access now enforces hidden visibility** (`scripts/window-pin-configuration.js`, `templates/window-pin-config.hbs`): Selecting `None: GM Only` now forces `Visibility=Hidden`, disables visibility editing in the form, and re-enforces `blacksmithVisibility='hidden'` on save to prevent invalid combinations.
- **Pin interaction lock for non-editors in Private access** (`scripts/pins-renderer.js`, `styles/pins.css`): `blacksmithAccess='private'` allows players to see pins but blocks click/drag/context interactions unless they are GM or owner/editor. Locked pins also use a non-interactive cursor affordance.
- **Pin config header portrait clipping regression (Application V2 migration)** (`styles/window-pin-config.css`): Restored header preview image to fill/crop inside the circular placeholder (`object-fit: cover`, circular clipping), matching pre-migration behavior.

## [13.7.0]

### Added

- **Unified Tags system** (`manager-tags.js`, `api-tags.js`, `settings.js`, `blacksmith.js`): New module-agnostic labeling infrastructure exposed at `game.modules.get('coffee-pub-blacksmith').api.tags`. Any coffee-pub module can register a taxonomy for its data types and attach, query, rename, or delete tags through a single shared API. Tags are stored centrally in a new world setting `tagAssignments` keyed by `{moduleId}.{dataType}` context key and record ID. A world-level `tagRegistry` tracks every tag ever used across all contexts. Full method surface: `setTags`, `getTags`, `addTags`, `removeTags`, `deleteRecordTags`, `getRecordsByTag`, `getChoices`, `getRegistry`, `normalize`, `rename`, `delete`, `seedRegistry`, `setVisibility`, `getVisibility`, `register`. Rename and delete propagate atomically across all records in all contexts. GM-only mutations route through the existing SocketLib GM proxy so non-GM players can tag records they own. Protected tags (marked `protected: true` in the taxonomy) cannot be renamed or deleted via the API.
- **Unified tag taxonomy** (`resources/tag-taxonomy.json`): Single JSON file that defines tag choices for all coffee-pub module contexts — `coffee-pub-blacksmith.journal-pin`, `coffee-pub-squire.note/codex/quest/objective`, and `coffee-pub-artificer.habitat-location/component-location/skill-location`. Replaces per-system taxonomy registration. An optional world setting `tagTaxonomyOverrideJson` accepts a path to a merge-override file. A pin-taxonomy.json compatibility shim ensures existing pin contexts load correctly during the migration window.
- **TagWidget** (`widget-tags.js`, `templates/partials/tag-widget.hbs`, `styles/widget-tags.css`): Reusable embeddable UI component for Application V2 windows. Full mode supports display, add, remove, and live-search against taxonomy suggestions. Filter mode renders visibility toggles for sidebar filter panels. Embed via `TagWidget.prepareData()` → `{{> blacksmith-tag-widget}}` → `TagWidget.readValue()` on save. `TagWidget.activate()` wires all interactivity after render.
- **Pin tag mirroring into central store** (`manager-pins.js`): Pin create, update, and delete operations now mirror tag data into `tagAssignments` via `_mirrorTagsForPin` and `_clearTagsForPin` helpers. All five write paths are covered: placed create, unplaced create, placed update, unplaced update, and the unplaced→placed transition. Tag data remains on `pin.tags[]` as the authoritative source during the migration window.
- **One-time pin tag backfill** (`manager-pins.js`, `settings.js`): `PinManager.backfillFlagAssignments()` runs once on first GM load to populate `tagAssignments` from all existing `pin.tags[]` across every scene and the unplaced store. Builds the full assignments object in a single in-memory pass and writes it in one settings call. Gated by `tagsAssignmentsMigrated` sentinel; merges with any forward-writes already present rather than overwriting.
- **One-time registry migration** (`manager-tags.js`): `TagManager.runMigration()` seeds `tagRegistry` from the existing `pinTagRegistry` on first GM load, preserving the world's entire tag vocabulary without any manual steps. Backward-compatible with worlds that ran under the previous `flag*` naming — detects old sentinels and copies data across automatically.

### Changed

- **Journal pin tag chips use Tags API** (`ui-journal-pins.js`): `_populateTagChips` now calls `tags.getChoices('coffee-pub-blacksmith.journal-pin')` filtered to taxonomy-tier entries instead of `pins.loadBuiltinTaxonomy()` + `pins.getPinTaxonomy()`. The async taxonomy load is removed from the toolbar render path since `TagManager` loads at init.
- **Pin configuration window Suggested/Other tags use Tags API** (`window-pin-configuration.js`): Tag group population replaced `PinManager.ensureBuiltinTaxonomyLoaded()` + `PinManager.getPinTaxonomyChoices()` + `PinManager.getPinTaxonomy()` + `PinManager.getTagRegistry()` with `tags.getChoices(contextKey)` (taxonomy tier only for Suggested) and `tags.getRegistry()` (for Other). Custom scene-local tags scan is unchanged. `pinClassificationHelp` now falls back directly to `pinTypeLabel` since `taxonomyChoices.label` was redundant.
- **`pins.getTagRegistry()` delegates to canonical store** (`api-pins.js`): Returns `TagManager.getRegistry()` (the authoritative `tagRegistry` world setting) with a fallback to `PinManager.getTagRegistry()` during the migration window. Callers using the old pins API surface now read from the unified store.
- **`pins.setTagVisibility()` syncs to Tags system** (`api-pins.js`): In addition to updating `pinsHiddenTags` for pin rendering, now also calls `TagManager.setVisibility()` so visibility state is consistent across both systems.

### Fixed

- **`renameTagGlobally` early-return prevented `tagAssignments` update** (`manager-pins.js`): The method had an early return when the tag was not present in `pinTagRegistry`. Tags added via `tags.setTags()` are written to `tagRegistry` but not `pinTagRegistry`, so renames called through the pins API never reached the `TagManager.rename()` call. Fixed by moving the `TagManager.rename()` call before the registry guard so it always runs regardless of pin registry state.
- **`deleteTagGlobally` and `renameTagGlobally` did not update `tagAssignments`** (`manager-pins.js`): GM tag management operations via the existing Pin Layers UI updated `pin.tags[]` on all scenes but left `tagAssignments` stale. Both methods now mirror the operation into the central store via `TagManager.delete()` and `TagManager.rename()` respectively.

## [13.6.6]

### Added

- **Targeter portraits above tokens** (`manager-token-indicators.js`, `settings.js`, `lang/en.json`): When one or more players have a token targeted, small portraits of those players now float above the token on the canvas. Each portrait shows the player's character image (falling back to their user avatar), clipped to the chosen shape with a colored border ring in their player color. Portraits stack horizontally, centered above the token, and update in real time as targeting changes. Three new settings appear in the Targeted Indicator section: **Show Targeter Portraits** toggle (enabled by default), **Portrait Shape** dropdown (Circle or Rounded Square), and **Portrait Size** slider (1–10, default 5). Size scales proportionally to the scene grid so portraits look correct at any grid resolution or zoom level.
- **Manual Rolls button in sidebar** (`ui-sidebar-style.js`, `sidebar-pin.css`, `lang/en.json`): A new button appears in the sidebar below the pin button, labeled "Manual Rolls" (or "Manual Rolls: Enabled" / "Manual Rolls: Disabled" when toggled). Clicking it toggles the manual rolls setting for all dice, with a confirmation message. The button icon changes to **`fa-solid fa-dice`** when enabled and **`fa-solid fa-dice-d20`** when disabled. The button is only visible for GMs.


## [13.6.5]

### Added

- **Hide/Show UI — per-region controls** (`utility-core.js`, `settings.js`, `lang/en.json`): Replaced coarse “hide left / hide bottom” with five user toggles (Toolbar `#ui-left-column-1`, Scene Controls `#ui-left-column-2`, Online Players `#players`, Macro Hotbar `#hotbar`, Floating Chat `#chat-notifications`). Hide/Show, **Apply on Load**, and the module hotkey only affect regions marked as included.
- **Manage UI start menu** (`utility-core.js`): **Hide UI** / **Show UI** plus an **Options** submenu (Apply on Load and each **Include …** line). Mirrors the Canvas settings; `_uiSuppressed` keeps DOM in sync when include flags change from the settings sheet (`updateSetting` / `clientSettingChanged`).
- **Toggle Hide/Show Interface keybinding** (`utility-core.js`, `lang/en.json`): Registered on `init` for Configure Controls (default **Ctrl+I**; moved from Ctrl+U to avoid browser View Source conflicts).
- **Start menu hotkey labels** (`utility-core.js`): **Hide UI** / **Show UI** and **GM Quickview On/Off** append the live shortcut from `game.keybindings.get()` (e.g. `Hide UI (ctrl + i)` and `GM Quickview Off (ctrl + q)`). `getKeybindingDisplayLower` now normalizes Control to **`ctrl`**.
- **Nested menubar context menus** (`api-menubar.js`): `_mapMenubarContextMenuItem` maps submenus recursively so **Manage UI → Options** renders correctly.
- **Request movement mode** (`token-movement.js`, `manager-sockets.js`): New movement type **`request-movement`**. When a non-GM moves a token, a dialog asks whether to request approval (**Cancel** / **Request Move**); the GM gets an allow/deny prompt and approved moves are applied on the GM client (`_gmApplyingApprovedRequestMove` bypass in `preUpdateToken`). If the GM declines, the player is notified. Socket events **`movementRequestAskGM`** and **`movementRequestDenied`** are registered with dynamic `import('./token-movement.js')` so handlers stay on the GM / clients without circular imports.

### Fixed

- **`renderChatMessage` remap** (`manager-hooks.js`, `coffee-pub-prototype/scripts/prototype.js`): `HookManager.registerHook` still remaps **`renderChatMessage` → `renderChatMessageHTML`** for v13+ compatibility; remap hints use a **single `console.warn` per session** (no UI notification spam). Prototype API test uses **`renderChatMessageHTML`** and `(message, html, context)`.
- **Leader vote tie-breaker DialogV2** (`manager-vote.js`, `vote.css`): Tie dialog reads the select from **`button.form`** / `dialog.element` (DialogV2 often has `dialog.form` null, so the GM button appeared to do nothing). **`VoteManager`** is referenced explicitly in the callback; **`try` / `finally`** always closes the dialog. Replaced oversized `<h3>` with intro copy + label, added **`blacksmith-leader-tie-breaker`** styles for readable body text and footer button contrast.
- **Leader vote tie — `activeVote` cleared too early** (`manager-vote.js`): After all votes were in, **`closeVote()`** ran **`_calculateResults()`** (which opens the GM tie dialog) but then immediately nulled **`activeVote`** and told other clients the vote closed. Choosing a leader then hit “no active vote.” **`closeVote`** / **`receiveVoteClose`** now pass **`pendingLeaderTieBreaker`** and keep **`activeVote`** until the GM finishes the tie dialog (or a non-tie close), then the usual close path clears state.
- **Manage UI include toggles not applying while hidden** (`utility-core.js`): In **Manage UI → Options**, toggling an **Include …** line now applies immediately when Hide UI is currently active (uses current hidden state plus `_uiSuppressed`), instead of waiting for a later global hide/show click.
- **Start menu Heap helper line removed** (`utility-core.js`): Removed the redundant "Left hamburger menu only..." description from the Heap row; the numeric heap display remains clickable for the full performance report.
- **Deprecated global `KeyboardManager`** (`utility-core.js`, `utility-quickview.js`, `blacksmith.js`): Read `foundry.helpers.interaction.KeyboardManager` instead of the global shim (v13 deprecation warning).
- **Request Roll cinematic button crash** (`window-skillcheck.js`): Fixed `TypeError: Cannot read properties of null (reading 'closest')` in cinematic roll button clicks by capturing `event.currentTarget` before async work and adding a null guard before calling `.closest(...)`.
- **Async click handler hardening** (`window-skillcheck.js`, `manager-vote.js`, `window-vote-config.js`, `token-movement.js`): Added defensive `currentTarget` element guards in async UI handlers to prevent null/invalid-target runtime errors during delayed event flows.
- **Token indicators persist after token delete** (`manager-token-indicators.js`): Added `deleteToken` cleanup to remove turn/target indicator graphics and purge deleted token IDs from indicator tracking sets/maps so stale rings never remain on canvas.
- **Quick View overlays persist after token delete** (`utility-quickview.js`): Added `deleteToken` cleanup to remove tracked quickview overlays and hatch IDs for deleted tokens, then re-run visibility/overlay scheduling to keep the canvas clean.

### Changed

- **Dialogs migrated to Application V2 (`DialogV2`)** (`utility-common.js`, `token-movement.js`, `manager-vote.js`, `window-vote-config.js`, `api-menubar.js`, `window-pin-layers.js`, `window-stats-party.js`, `window-pin-configuration.js`, `window-gmtools.js`): Replaced legacy `new Dialog` / `Dialog.confirm` with `foundry.applications.api.DialogV2` (static `confirm` / `wait` where appropriate, instance dialogs with explicit `close()` for forms). Clipboard fallback uses a DOM-built textarea so pasted text is not parsed as HTML. Menubar timer and leader prompts no longer nest `<form>` inside DialogV2’s wrapper form.
- **Directory JSON import windows (`BlacksmithWindowBaseV2`)** (`blacksmith.js`, `window-json-import.js`, `window-json-import.hbs`, `window-json-import.css`): Journal, Item, Roll Table, and Actor directory **Import** flows now use a shared Application V2 Blacksmith window with the standard Blacksmith header, fixed chrome title **Import JSON**, and per-window header titles (**Import Journal / Item / Roll Table / Actor**). Layout was refined into two sections (template copy + import), with full-height paste area, action-bar buttons (**Select JSON File** secondary-left, **Import JSON** primary-right), and no redundant close button. Item import icon uses **`fa-briefcase`**.
- **Fastest Path — chat parity with Conga** (`token-movement.js`): Removed per-leader-move `calculateMarchingOrder(..., postToChat: true)` after follower processing (previously only Conga skipped that path). Follower **blocked / too-far** recalculation now uses **`postToChat: false`**. Marching-order chat cards match Conga frequency: mode change / leader setup / `handleTokenOrdering`, not every drag.
- **Token movement — labels, icons, and Request UX** (`token-movement.js`, `api-menubar.js`, `manager-sockets.js`, `templates/menubar.hbs`, `movement-window.hbs`, `cards-common.hbs`, `lang/en.json`): Modes renamed to **Wander**, **Locked**, **Combat**, **Conga**, and **Fastest Path** (replacing older “Free / Movement Locked / Combat Mode / Conga Movement / Fastest Path Movement” wording). Combat mode icon is **`fa-person-harassing`**; Fastest Path uses **`fa-person-running`**; **Request** uses **`fa-person-circle-question`**. Movement chips and config use **`fa-solid …`** for Font Awesome 6. **`preUpdateToken`** treats any `extractMovementSubset` change (position, elevation, rotation, size) as movement. Request dialogs show the question icon in the body; GM dialog uses the same icon treatment and **`fa-solid`** for Yes/No.
- **Canvas settings copy** (`lang/en.json`): Canvas section hint documents Configure Controls for **Toggle Hide/Show Interface** and points users at the granular include toggles.
- **Release packaging includes theme assets** (`.github/workflows/release.yml`): Added `themes/` to the release zip so Request Roll theme JSON, images, and sounds are shipped with tagged releases.
- **Release packaging includes changelog file** (`.github/workflows/release.yml`): Added `CHANGELOG.md` to the release zip to match the `module.json` changelog reference.


## [13.6.4]

### Added

- **Pin taxonomy API — `getModuleTaxonomy(moduleId)`** (`manager-pins.js`, `api-pins.js`): New public method returns a module's full taxonomy as `{ [type]: { label, tags } }`. Allows other modules to read their registered pin types and tags without needing to know internal registry keys.
- **Pin taxonomy — type-scoped tag visibility** (`manager-pins.js`, `settings.js`): New client setting `pinsHiddenTypeTags` (`object`) stores hidden state per `moduleId|type|tag` key, separate from the existing global `pinsHiddenTags`. New methods: `isTypeTagHidden`, `setTypeTagHidden`, `clearTypeTagHiddenState`. Toggling a tag in a type group no longer bleeds into the same tag name in another type's group.
- **Pin Layers — TAXONOMY section** (`window-pin-layers.js`, `window-pin-layers.css`): Replaced the flat CATEGORIES + TAGS layout with a single TAXONOMY section. Tags are grouped by type (one group per registered pin type), each showing a **Predefined** subsection (taxonomy-defined tags) and a **Custom** subsection (registry orphan tags + scene-local custom tags). A **Global** group shows the top-level `globalTags` from the JSON. A **Custom** catch-all group at the bottom shows all orphan registry tags.
- **Manage Custom Pin Tags window** (`window-pin-layers.js`, `window-pin-layers.css`): New Application V2 window for GM custom pin tag administration. It lists each custom tag with current-scene usage, global usage, pin types, and explicit actions for **Rename Globally**, **Strip From Current Scene**, **Strip From All Scenes**, and **Delete Globally**. GMs can also add registry-only custom tags before any pin uses them.
- **Pin Layers — tag counts always visible** (`window-pin-layers.js`): Every tag chip now shows a scene-pin count. Predefined tags with zero matching pins render with a dashed border (`is-empty`). Custom tags from the orphan registry that have been stripped from all scene pins remain visible with count 0 rather than disappearing.
- **Configure Pin — Suggested / Other tag groups** (`window-pin-configuration.js`, `window-pin-config.hbs`, `window-pin-config.css`): The flat tag chip list is split into two labeled sections. **Suggested** shows the current pin type's taxonomy tags plus custom tags found on scene pins of that type. **Other** shows global tags, other types' taxonomy tags, and orphan registry tags — all in one flat group. Both groups toggle tags into the Tags input identically.

### Fixed

- **Pin taxonomy — `PIN_TYPE` lazy getter** (`ui-journal-pins.js`): Replaced the hardcoded `static PIN_TYPE = 'journal-pin'` with a lazy getter that reads the first key from `getModuleTaxonomy(MODULE.ID)` at runtime. The JSON key is now the authoritative source; changing the key in `pin-taxonomy.json` propagates automatically without code changes.
- **Pin taxonomy — hardcoded tags removed from `_registerJournalTaxonomy`** (`ui-journal-pins.js`): The tag array `['journal', 'location', 'shop', ...]` was being merged into the taxonomy on every registration, overriding the JSON. Removed entirely; taxonomy now comes solely from `loadBuiltinTaxonomy` / `pin-taxonomy.json`.
- **Pin Layers — unified tag chip CSS** (`window-pin-layers.js`, `window-pin-layers.css`): The tag cloud was overriding `.blacksmith-tag` with `all: unset` and forcing orange-by-default, diverging from the global design system. Removed the override; tag chips now use the shared `.blacksmith-tag` / `.blacksmith-tag.active` styles from `window-form-controls.css`. Active (visible) tags render orange; inactive (hidden) tags render neutral — matching the Pin Configuration window.

### Changed

- **Pin Layers — tag chip active state inverted** (`window-pin-layers.js`): Tag chips now use `.active` when the tag is *visible* (click to hide) and no modifier when *hidden* (click to show), consistent with the global `.blacksmith-tag` convention used in Pin Configuration.
- **Pin Layers — custom tag administration moved out of layers** (`window-pin-layers.js`): Removed the pencil/manage mode from the **Manage Pin Layers** tab so that tab stays focused on visibility filters. Custom tag mutations now live in the dedicated **Manage Custom Pin Tags** window.

## [13.6.3]

### Added

- **Journal toolbar — tag selector** (`ui-journal-pins.js`, `templates/toolbar-pins.hbs`, `styles/journal-pins.css`): A tag chip row now appears below the icon row in the journal "Pin Page" toolbar. Tags are populated from the registered `journal-pin` taxonomy (via `getPinTaxonomy`, not the global choice set) so only the relevant tags appear. Chips default to unchecked; multiple may be selected. Selected tags are collected and passed to `_ensurePin` / `_beginPlacement` on click.
- **Journal toolbar — state restore on open** (`ui-journal-pins.js`): When a journal sheet opens or the active page changes, `_restoreBarState` looks up the page's linked pin and pre-selects the matching icon button and tag chips. Defaults the **narrative** tag chip when no saved state exists (new page or pin has no tags).
- **Pin Layers — per-pin Browse actions** (`window-pin-layers.js`): Browse view now shows per-pin action buttons for Player Visibility (eye toggle), Configure (gear), and Delete (danger icon) next to each pin row. GM-only.
- **Pin Layers — "Delete All" action bar button** (`window-pin-layers.js`): GM-only "Delete All" button added to the action bar left zone in the Layers window, replacing the bulk-delete items that were removed from the context menu.
- **Configure Pin — Player Visibility field** (`window-pin-configuration.js`, `window-pin-config.hbs`): `config.blacksmithVisibility` (`'visible'` / `'hidden'`) is now editable in the Permissions section alongside the ownership dropdown. Separate from ownership — a pin can have player-observable ownership but be hidden from the map. Player Visibility is included in Update All (Permissions section) and Use as Default (if Permissions section is checked).
- **Configure Pin — "Update All [type] Pins" in action bar** (`window-pin-config.hbs`): Update All toggle moved from the header into the action bar left zone and renamed to "Update All [type] Pins" for clarity.
- **Configure Pin — Update All tag filter** (`window-pin-configuration.js`, `window-pin-config.hbs`, `styles/window-pin-config.css`): When "Update All [type] Pins" is active and the scene has same-type pins, a "Filter by tag:" chip row appears below the toggle. Chips show every tag used across all same-type pins on the scene. The current pin's own tags are pre-selected. Selecting multiple chips uses OR logic — any peer pin sharing at least one selected tag is included. Type is always the first gate; tags narrow within it. The confirmation dialog names the active tag filter.
- **Configure Pin — "Default for [type]" with per-section checkboxes** (`window-pin-configuration.js`, `window-pin-config.hbs`): The header "Default" toggle is renamed "Default for [type]". When enabled, each section header shows an additional "Default" checkbox so users choose exactly which sections (Permissions, Classification, Design, Text, Animations, Source) are written to `clientPinDefaultDesigns`. Warns if no sections are checked. Falls back to saving all design fields when no checkboxes are rendered (backward compat).
- **Window position persistence** (`scripts/window-base.js`): All `BlacksmithWindowBaseV2` windows now save and restore their position and size via `localStorage`. Key is `blacksmith-win-pos-<ClassName>`. Position is debounced on `setPosition()` (250 ms) and restored via `requestAnimationFrame` on first render. No code changes needed in subclasses.

### Fixed

- **Journal toolbar — tag row too wide** (`ui-journal-pins.js`): `_populateTagChips` was calling `getPinTaxonomyChoices` which merges registered tags with every global tag ever used across all pins (narrative, backstory, encounter, etc. from other modules). Changed to `getPinTaxonomy` so only the `journal-pin` taxonomy tags are shown.
- **Journal toolbar — selected tags not saved to existing pin** (`ui-journal-pins.js`): The `_ensurePin` update path (existing linked pin) only patched `text` and `image`, silently ignoring the user's tag selections. Fixed to include `tags` in the patch whenever `opts.selectedTags` is provided.
- **Journal toolbar — icon row and tag row not visually connected** (`styles/journal-pins.css`): The outer bar was `display: flex` (row direction), placing the two rows side-by-side instead of stacked. Changed to `flex-direction: column`. The tag row now shares the same `--dnd5e-journal-header-background` as the icon row with complementary border-radius (`3px 3px 0 0` / `0 0 3px 3px`) so they render as one unified toolbar block.
- **Configure Pin — PinManager undefined on save** (`window-pin-configuration.js`): The save handler referenced `PinManager` which was only in scope via dynamic `import()` inside `getData()`. Fixed by adding a local `const { PinManager: PM } = await import('./manager-pins.js')` inside the save handler.
- **Configure Pin — icon tooltip showing "Solid"** (`window-pin-configuration.js`): `formatIconLabel` used `.find(cls => cls.startsWith('fa-'))` which matched `fa-solid` before the icon name. Fixed by skipping known style-prefix classes (`fa-solid`, `fa-regular`, `fa-light`, `fa-thin`, `fa-duotone`, `fa-brands`). Also removed the `.replace(/-/g, ' ')` so the raw icon name (e.g. `skull`) is shown rather than replacing hyphens.
- **Configure Pin — "Default for [type]" toggle not showing as enabled** (`window-pin-config.hbs`): The default toggle input was missing `{{#if defaultMode}}checked{{/if}}`, so toggling it on and re-rendering always rendered it unchecked. Fixed.
- **Configure Pin — "Default for [type]" toggle not hiding section checkboxes** (`window-pin-configuration.js`): The section-default checkboxes are conditionally rendered via `{{#if defaultMode}}`; after `render(true)` the new DOM correctly reflects the flag because the toggle `checked` state is now also restored.
- **Configure Pin — Pin Source header layout** (`window-pin-config.hbs`): The `<span>` wrapping section checkboxes and the source icon had no flex layout, causing the Image/Icon toggle and checkboxes to visually collapse/overlap. Fixed by restructuring: checkboxes moved to a right-aligned `.blacksmith-pin-config-section-actions` span; Image/Icon toggle moved from the section header into the section body as a standalone row.

### Changed

- **Journal toolbar — PIN PAGE button style** (`styles/journal-pins.css`): Button is now green (dark forest green background, light green text) to signal it as the primary action, rather than the neutral dark style used by passive controls.
- **Configure Pin — "Allow Duplicates" moved to Permissions** (`window-pin-config.hbs`): "Allow Duplicates of this Pin on the Canvas" toggle moved from the header into the Permissions section body, alongside ownership and Player Visibility.
- **Context menu — "Visibility" renamed to "Player Visibility"** (`pins-renderer.js`): The right-click context menu item is renamed to match the field name used in Configure Pin and Browse view.
- **Context menu — bulk deletes removed** (`pins-renderer.js`): "Delete All Pins" and "Delete All [Type] Pins" removed from the right-click context menu. Bulk delete is now in the Pin Layers window action bar (GM-only, with confirmation).
- **Configure Pin — section header layout** (`window-pin-config.hbs`, `styles/window-pin-config.css`): All section headers now use a `title | actions` flex layout: icon + title on the left, Update All / Default checkboxes right-aligned with labels. Image/Icon toggle in Pin Source moved to the section body.
- **Pin Layers — Browse Player Visibility icon** (`window-pin-layers.js`): Per-pin Player Visibility action button changed from `fa-eye` / `fa-eye-slash` to `fa-users` / `fa-users-slash` to avoid confusion with the layer-level visibility eye icons.


## [13.6.2]

### Added

- **World tag registry** (`manager-pins.js`, `api-pins.js`, `settings.js`): New GM-writable world setting `pinTagRegistry` (`string[]`) that tracks every tag ever used across all pins. Auto-seeded on `ready` from the built-in taxonomy and auto-populated whenever a pin is created or updated. Exposed on the public API: `getTagRegistry()`, `deleteTagGlobally()`, `renameTagGlobally()`, `seedTagRegistryIfEmpty()`. `deleteTagGlobally` and `renameTagGlobally` scrub all scene pins and saved visibility profile snapshots so profiles never contain stale tags.
- **Pin Layers — tag manage mode** (`window-pin-layers.js`, `window-pin-layers.css`): GMs can toggle a "Manage" icon-button in the Tags section header to enter manage mode, which replaces per-tag toggle counts with X (delete) buttons. Confirming a delete calls `deleteTagGlobally`. Replaced the previously broken right-click context menu (which crashed on empty selector) with this toggle pattern.
- **Pin Layers — Update button** (`window-pin-layers.js`): The profile Update button now only appears when the current visibility state differs from the saved profile snapshot, preventing accidental no-op saves. Profile snapshots are automatically kept current when tags are deleted or renamed globally.
- **Pin Config — Update All mode** (`window-pin-configuration.js`, `window-pin-config.hbs`): Replaced the single "Save and Update All" footer button with an "Update All" header toggle (GM only). When active, each section header (Permissions, Classification, Pin Design, Text Format, Event Animations, Pin Source) shows a checkbox defaulting to unchecked. On save, only checked sections are bulk-applied to all other same-type pins on the scene after a confirmation dialog.
- **`pin-taxonomy.json` v3** (`resources/pin-taxonomy.json`): Restructured as a multi-module master list with top-level `globalTags` array and a `modules` object keyed by `moduleId`. Each pin category has a single `tags` array (removed legacy `defaultTags`/`suggestedTags`). Added `coffee-pub-artificer` entries: `habitat-pin` (12 terrain tags), `component-pin` (6 component types), `harvesting-pin` (14 skill tags).

### Fixed

- **Non-square pin rendering** (`pins-renderer.js`): `_calculatePinPosition` was using `Math.min(w, h)` for both dimensions, forcing all pins square regardless of configured height. Fixed to apply `pinWScreen` and `pinHScreen` independently so a 120×240 pin renders as 120×240.
- **Constrain proportions behaviour** (`window-pin-configuration.js`, `window-pin-config.hbs`): "Constrain proportions" now enforces a true 1:1 square (height = width) and disables the height input while locked, rather than maintaining an arbitrary saved ratio. Toggling off re-enables the height field.
- **`lockProportions` resets to ON on every open** (`window-pin-configuration.js`): `getData()` now reads `lockProportions` from `clientPinDefaultDesigns` for the matching `moduleId|type` key (saved when "Use as Default" is checked), falling back to `w === h` for pins without a saved default, instead of always hardcoding `true`.
- **"Save as Default" missing image fields** (`window-pin-configuration.js`): The design snapshot saved to `clientPinDefaultDesigns` now includes `image`, `imageFit`, and `imageZoom` so the full visual appearance is restored when the window reopens for a matching pin type.
- **Browse tab tag color scheme** (`window-pin-layers.js`, `window-pin-layers.css`): Orange now correctly means visible/active; muted dark means hidden — consistent with the Layers tab. Category chips are styled distinctly (blue-slate with a layer-group icon) to differentiate them from regular tag chips. Removed the redundant "hidden" word badge.
- **Pin Config header** (`window-pin-config.hbs`, `window-pin-configuration.js`): Header now shows `Category: Pin Title` (e.g., `Journal Pin: The Rusty Anchor`) with `pin.text` passed as `pinName`. Previously the pin title was dropped.

### Changed

- **Pin Config — GM-only controls** (`window-pin-config.hbs`): Allow Duplicates, Use as Default, and Update All toggles are now all wrapped in `{{#if isGM}}` so non-GM players never see them.
- **Taxonomy loader** (`manager-pins.js`): `_loadTaxonomyJsonIntoRegistry` reads the v3 format (`globalTags` + `modules.{moduleId}.pinCategories`), with legacy flat `pinCategories`/`pinTypes` fallback for older JSONs.
- **API docs** (`documentation/api/api-pins.md`): Added Tag Registry section documenting `getTagRegistry`, `deleteTagGlobally`, `renameTagGlobally`, and `seedTagRegistryIfEmpty` with usage examples.


## [13.6.1]

### Fixed

- **External `module.api` null during `ready`** (`scripts/blacksmith.js`, `api/blacksmith-api.js`): Assign the full public **`game.modules.get('coffee-pub-blacksmith').api`** **synchronously at the start of `init`**, before any **`await`** in that hook, so other modules’ **`ready`** handlers never see **`api === null`** while Blacksmith’s async **`init`** is suspended. Load **`BlacksmithAPI`** via **`import()`** only when calling **`markReadyForConsumers()`** in **`ready`**. **`markReadyForConsumers()`** calls **`_syncGlobalsFromApi()`** when **`BlacksmithAPI`** is already marked ready so **`window.Blacksmith*`** stays aligned after asset merge; **`_markReady()`** reuses **`_syncGlobalsFromApi()`**.
- **`module.api.assetLookup` stale reference** (`scripts/blacksmith.js`): After each **`initializeAssetLookupInstance`** in **`ready`**, set **`mod.api.assetLookup`** to the live export so consumers do not keep a pre-instance **`null`**.
- **Combat tracker settings before registration** (`scripts/ui-combat-tracker.js`): Read combat-related settings with **`getSettingSafely`** so deferred **`ready`** / timeout paths do not call **`game.settings.get`** before **`registerSettings()`** has run (fixes **`combatTrackerSetFirstTurn` is not a registered game setting** and similar throws).

### Changed

- **Documentation** (`documentation/architecture-blacksmith.md`, `documentation/api-core.md`, `documentation/api-window.md`, `documentation/guides/blacksmith-apis.md`): Document **`module.api`** vs **`window.Blacksmith*`** timing (**`markReadyForConsumers`**), when to use **`BlacksmithAPI.waitForReady()`**, and integration checklist corrections.

## [13.6.0]

### Added

- **Asset Mapping** (`settings.js`, `lang/en.json`): Per-category paths under **Manage Content** default to **`modules/<id>/resources/asset-defaults/*.json`** (shipped with the module). Clear a field to use only the embedded `assets-legacy.js` data for that category (no fetch). Chat card appearance themes remain in **`api-chat-cards.js`** (`CHAT_CARD_THEMES`); legacy `dataTheme` removed.
- **Asset loader** (`asset-loader.js`): `loadAssetBundlesWithOverrides` fetches and merges overrides; `reloadAssetManifestsFromWorldSettings` rebuilds `AssetLookup` and choice caches when a path changes (`onChange` on each Asset Mapping setting).
- **Phase 1 — default JSON split** (`resources/asset-defaults/`, `module.json`): Shipped **`assets-*.json`** (`manifestVersion` + category keys); **`module.json` → `files`** lists them for packaging. Defaults load at runtime via **`fetch`** only (`loadDefaultAssetBundlesFromJson`); **no** Node or build step. **`resources/asset-defaults/README.md`** documents authoring.

### Fixed

- **Asset lookup + module API during `ready`** (`blacksmith.js`): Initialize **`AssetLookup` from bundled assets synchronously** before the first `await` (JSON override fetch). Async `ready` callbacks from other Coffee Pub modules can run between awaits; they must not see **`assetLookup === null`** (`getAllConstants`, `registerModule`, etc.). Optional merge still runs afterward; **`getAllConstants`** uses optional chaining as a safety net.
- **Compendium / roll table / sound choice caches + `BlacksmithAPI` timing** (`settings.js`, `blacksmith.js`, `api/blacksmith-api.js`): **`primeCoreChoiceCaches()`** runs at the **start** of `ready` (before asset fetch) for compendiums/tables/macros. **`BlacksmithAPI.markReadyForConsumers()`** runs **only after** merged asset JSON + **`refreshAssetDerivedChoices()`** so **`BLACKSMITH.arrSoundChoices`** and related caches match shipped + Asset Mapping. **`getCompendiumChoices`** is synchronous (removed unnecessary `async`). **`checkBlacksmithReady()`** no longer calls **`_markReady()`** on `ready` (that ran too early).
- **Menubar vs `registerSettings` order** (`api-menubar.js`, `blacksmith.js`): **`MenuBar.runReadySetup()`** (partials, **`registerSecondaryBarTypes`**, first render) runs **after** **`registerSettings()`**, fixing **`encounterToolbarDeploymentPattern` is not a registered game setting** when **`_registerPartyTools`** read settings before registration.

### Changed

- **JSON layout** (`resources/`, `module.json`, `asset-loader.js`, Asset Mapping in `settings.js` / `lang/en.json`): Renamed/moved files — **`assets-background-cards.json`**, **`assets-skillchecks.json`**, **`config-volumes.json`**, **`config-nameplates.json`**, **`narratives-stats-mvp.json`**; removed Asset Mapping overrides for volumes and nameplates (shipped **`resources/`** config only).

### Documentation

- **`documentation/plan-assets.md`**: Status and implementation notes for split manifests, loader, deferred init, and settings.

## [13.5.10]

### Added

- **Layout & experience → Pins** (`settings.js`, `lang/en.json`): New **Pins** heading under **Canvas** with **Player Pin Editing** (`pinsAllowPlayerWrites`); strings moved out of the **Imports** block so localization matches the sheet order.

### Changed

- **Developer Tools → System** (`settings.js`, `lang/en.json`): **H1 Developer Tools** uses **client** scope so GMs and players see the same tab title. **H2** label is **System** (replaces **Performance**) with an updated hint (menubar tools, performance monitor, latency). Subsections: **H3 Menubar** (show Settings / Refresh tools), **H3 Performance Monitor** (**Enable Performance monitor**, **Heap display refresh interval**), **H3 System Latency** (unchanged settings, clarified hints).
- **Pins UI** (`manager-pins.js`, `api-menubar.js`): Pin visibility and clear actions are **only** in the **left hamburger menu** (**Pins** submenu via `CoreUIUtility.getLeftStartMenuItems` / `MenuBar._getPinsVisibilityMenuItems`); there is no pin control on the main menubar strip. Removed `pins-visibility`-specific icon fallbacks in menubar zone grouping.

### Removed

- **Menubar pins tool** (`manager-pins.js`): Unregistered **`pins-visibility`** (previously hardcoded `visible: false` / briefly tied to a toggle).
- **Setting** `menubarShowPins` (**Show Pins Toggle Tool**) (`settings.js`, `lang/en.json`): Dropped; stale client values are harmless.

### Fixed

- **Latency + SocketLib** (`manager-sockets.js`): **`ping`**, **`pong`**, and **`latencyUpdate`** handlers are **always** registered once the Blacksmith socket is ready. Payload handling still no-ops when **Enable System Latency Checks** is off. Prevents **`SocketlibUnregisteredHandlerError: No socket handler with the name 'ping'`** when the GM disables latency but another client (e.g. not yet refreshed) still sends pings.

### Documentation

- **`documentation/plan-settings.md`**: Tracking table and findings updated for **System** settings layout, **Pins** (hamburger-only, **Canvas → Pins**), and latency handler registration model.

## [13.5.9]

### Added

- **Vision (GM Quickview)** (`settings.js`, `lang/en.json`): New **Run the Game → Vision** block — **Enable Quickview** (`quickViewEnabled`, client, mirrors menubar/hotkey), **Darkness overlay strength** (moved from User Experience → Canvas), **Out-of-sight token highlight color** (`quickViewSightHighlightColor`, hex string).
- **Quickview keybinding**: **Toggle Quickview** via Foundry **Configure Controls** — default **Ctrl+Q** (`game.keybindings.register` on **`init`**, with **`ready`** + **`initialize()`** fallbacks so the action always appears under **Coffee Pub Blacksmith**). **`utility-quickview.js`**
- **Menubar Quickview** (`utility-quickview.js`): Tool **visible for GMs**; right-click **Enable Quickview** / **Disable Quickview**; start menu (`utility-core.js`) uses the same labels.

### Fixed

- **Quickview — out-of-sight token highlight** (`utility-quickview.js`, `manager-libwrapper.js`): Highlights no longer relied on `token.visible` after a deferred pass (often always true for GMs). **Detection** uses **`canvas.visibility.testVisibility`** (with **`token.isVisible`** fallback) **before** forcing GM visibility. **Drawing** uses **`canvas.interface`** (world-space rounded rect) so borders are not dimmed with token meshes. **`restrictVisibility`** wrapper runs **`_syncQuickViewHatchAfterRestrict`** immediately; deferred **`_scheduleQuickViewTokens`** only reapplies GM visibility and redraws stored highlight IDs (`_reapplyGmTokenVisibilityAndOverlays`).
- **Combat timer** (`timer-combat.js`): Align **`state.duration`** with configured turn length on init and use **`Math.max(configuredLimit, state.duration)`** for progress **width** so the bar matches “time remaining” when duration and settings differ (fixes bar stuck at full width).
- **Planning timer** (`timer-planning.js`, `styles/timer-planning.css`, `ui-combat-tracker.js`): **Do not** treat an **empty** `combat.turns` as “all initiatives rolled”; start only via **`updateCombatant`** / deferred **`_tryStartWhenPlanningReady`** so the bar does not flash on round advance before initiative clears; **`renderCombatTracker`** strips planning DOM when **verify** fails; GM **`updateCombat`** stops the timer when initiative is cleared mid-planning; **one** shared **`_planningBarDenominatorSeconds()`** for bar width, color tiers, and “ending soon” interval logic (fixes critical-threshold mismatch); **brightness** pulse instead of **opacity** for **`.low`** to avoid edge strip artifacts; **ready** pass on **`CombatTracker`** runs **`_checkAllInitiativesRolled`** when combat is already active (reload).

### Changed

- **Quickview (GM)** (`utility-quickview.js`): On/off is driven by the **Enable Quickview** client setting (menubar, hotkey, and settings sheet stay in sync); changing scenes clears the setting when Quickview was active; **`canvasReady`** reapplies when the setting is on after load.
- **Performance**: **Round / planning / combat tracker timers** — avoid per-tick or per-`updateUI` `document.querySelectorAll` hot paths by caching bar/text/progress (or round/total time) element lists; **refresh** when cached nodes disconnect, when the combat tracker re-renders (`renderCombatTracker`), or when the cache is empty while the timer should be visible (`timer-round.js`, `timer-planning.js`, `timer-combat.js`). See **`documentation/PERFORMANCE.md`** rank 5.
- **Documentation**: Merged `documentation/PERFORMANCE-journal-lifecycle-checklist.md` into **`documentation/PERFORMANCE.md`** (single source of truth). Added code-review items: duplicate journal pin hooks, `JournalDomWatchdog` sheet retention, Quick View hooks, pin renderer cleanup gap.
- **Performance**: **`JournalPagePins`** — register `renderJournalSheet`, `renderJournalPageSheet`, and journal-filtered `renderApplication` via **`HookManager` only** (removed duplicate `Hooks.on` that ran pin logic twice per render). **`JournalDomWatchdog`** — prune detached journal sheet roots from `_knownSheets` each interval tick to avoid retaining closed sheet DOM for the whole session.
- **Performance**: **Menubar** (`api-menubar.js`) — **`renderMenubar`** skips full DOM remove/rebuild when a **structure fingerprint** (tools, notifications, secondary bar, movement, leader text, etc.; not per-second timer) is unchanged; applies **lightweight refresh** for timer/progress/leader/movement labels. **`updateLeaderDisplay`** triggers a full render only when this user’s **party-leader role** changes (leader-only tools visibility).
- **Fix**: Menubar fingerprint now includes **live secondary bar content** (`secondaryBarInfoUpdates` + custom bar `data` JSON) so **`updateSecondaryBarItemInfo`** / **`updateSecondaryBar`** still force a real rebuild when reputation, party health, Minstrel, Herald, etc. update while a bar is open.
- **Fix**: Fingerprint also includes **`secondaryBarActiveStates`** (switch / “select one” groups) and **toggleable** secondary button `active` flags so the selected button styling updates after **`updateSecondaryBarItemActive`** / toggle clicks.

## [13.5.8] - 2026-03-02 - PERF STACK QUICK WINS (RANK 7)

### Added

- **Performance**: Ranked checklist for encounter toolbar, journal page pins, and duplicate journal monitoring — **now in** `documentation/PERFORMANCE.md` (Journal & encounter lifecycle checklist); was shipped as `PERFORMANCE-journal-lifecycle-checklist.md` in this release.
- **Public API**: `game.modules.get('coffee-pub-blacksmith').api.createJournalEntry(journalData)` — same behavior as JSON journal import (narrative / encounter / location). **Docs:** `documentation/api-create-journal-entry.md`.
- **Public API**: `api.BlacksmithWindowBaseV2` and `api.getWindowBaseV2()` — stable access to the Application V2 base class for subclassing (registry `registerWindow` / `openWindow` unchanged). **Docs:** `documentation/api-window.md`. **Timing:** base class is also seeded on `module.api` at **module load** (before `init`/`ready`) so dependents that pick a superclass at import time (e.g. Regent) see it when listed after Blacksmith; registry methods still attach in `ready`.

### Changed

- **Internal (file naming, Batch 4)**: `window-base-v2.js` → **`window-base.js`** (canonical Application V2 base); `blacksmith.js` imports `window-base.js`. **`window-base-v2.js`** is a thin re-export shim for stale deep links. Class name **`BlacksmithWindowBaseV2`** and **`module.api`** surface unchanged.
- **Internal (file naming, Batch 4 partial)**: `data-collection-processor.js` → `manager-data-collection.js` (`constants-generator.js` import updated; exported class still `DataCollectionProcessor`).
- **Internal (file naming, pre–Batch 4)**: `latency-checker.js` → `manager-latency-checker.js`; `window-pin-config.js` → `window-pin-configuration.js`. Imports (`blacksmith.js`, `manager-sockets.js`, `api-pins.js`) and architecture docs updated; templates/CSS remain `window-pin-config.*`.
- **Internal (file naming, Batch 3)**: Renamed scripts to role-first names — `encounter-toolbar.js` → `ui-journal-encounter.js`, `combat-tracker.js` → `ui-combat-tracker.js`, `combat-tools.js` → `ui-combat-tools.js`, `journal-tools.js` → `manager-journal-tools.js`, `journal-page-pins.js` → `ui-journal-pins.js` (also `module.json` esmodules entry), `vote-config.js` → `window-vote-config.js`. Imports updated; behavior unchanged.
- **Compatibility shims**: Restored tiny `scripts/journal-page-pins.js` and `scripts/common.js` that re-export from `ui-journal-pins.js` / `utility-common.js` so stale manifests, caches, or deep links do not 404.
- **Targeted token rings**: **Use Player Color** — concentric borders still use each user’s color; **inner fill** only for users with **OWNER** on the **active combatant** during started combat (others get border-only rings). New **Border Thickness** (`targetedIndicatorBorderThickness`, 1–10, default 3) drives targeted ring line width (separate from General Indicators thickness). **Default Border / Default Background** colors renamed (hex **String** settings; `ColorField` as `register` `type` was reverted — it could **stall world load** at “Finalizing…”). `_coerceColorSettingToHex` still normalizes reads. Setting order: Style → Animation → Speed → **Border Thickness** → **Use Player Color** → default colors. **Fix:** `User#color` via `Color.from()` + numeric coercion (v13). **Load fix:** early `registerSettings()` wrapped in try/catch + `forceHide` on failure.

- **Votes**: Eligible voters are **logged-in non-GM users with OWNER on at least one token in the current scene**; quorum/progress/`castVote` use a per-vote `eligibleUserIds` snapshot. Starting a vote with nobody eligible shows a clear warning. Character-vote “players” source uses the same rule.
- **Party leader menu**: Labels show **player names only** in parentheses (active player owner preferred, never the GM display name); character-only label when only the GM has owner access. Dialog select matches the same labels.
- **SocketManager (native fallback)**: Before registering the inbound `game.socket` listener, tear down any existing listeners on the module channel via `game.socket.off(...)` and reset the native handler map so re-init / hot reload does not stack duplicate handlers.
- **HookManager**: Removed no-op `renderApplication` and `closeApplication` registrations (empty callbacks left after window-registry work); reduces redundant hook dispatch noise.
- **BlacksmithWindowBaseV2**: Dropped scroll save/restore for unused `.blacksmith-window-template-details-content`; body scroll handling unchanged.
- **Menubar (right zone)**: Session timer is always the rightmost control; dynamic right-zone tools render before it.
- **Journal double-click watchers (Phase B)**: In `scripts/blacksmith.js`, removed duplicate direct fallback hooks (`renderJournalSheet` / `renderJournalPageSheet`) and removed the extra capture-phase page-navigation click listener. HookManager + MutationObserver path remains; this trims duplicate callback pressure while keeping behavior.
- **Journal monitoring consolidation (Phase C)**: Added shared `scripts/journal-dom-watchdog.js` and rewired `blacksmith.js`, `encounter-toolbar.js`, and `journal-page-pins.js` to consume a single journal sheet/page event pipeline. This removes per-feature DOM observer/interval fallbacks and completes the duplicate journal monitoring consolidation (rank 3).

### Removed

- **Menubar user exclusion (moved to Herald)**: Removed world setting **Excluded Menubar Users** (`excludedUsersMenubar`) and the **Blacksmith Menubar** settings heading. Blacksmith no longer reads a comma-separated user list; menubar/combat-bar exclusion stubs always allow. Vote flows no longer use that list for eligibility (use Herald for per-user UI policy).

### Fixed

- **Start menu (hamburger)**: The performance row shows the same **heap readout** as the optional menubar performance tool (`Heap: …` / `Heap: N/A`); click still opens the full **PERFORMANCE CHECK** notification. Typo: Quick View description “larity” → “clarity”.
- **Apply on Load** (`canvasToolsHideUIOnLoad`): Hiding the core UI on load now uses **computed** `display` for visibility checks, **silent** toggle (no toast spam), **delayed retries** (`requestAnimationFrame`, timers), and **`canvasReady`** so v13 can build `#ui-left` before we hide.
- **Targeted ring (custom indicator)**: Removed the guard that only handled **`game.user`** targets; target state is tracked **per user** and **unioned** so all clients see rings for **everyone’s** targets. Seeded from **`User#targets`** on refresh; `updateUser` clears disconnected users.

- **Combat bar (menubar)**: After closing the secondary combat bar, the toolbar button could not reopen it because `__combatBarUserClosed` was enforced inside the patched `openSecondaryBar` while the menubar **API** sometimes invoked the **unpatched** `toggleSecondaryBar` (no flag reset). Manual opens no longer use that guard; **`openCombatBar()`** (hook-driven auto-open) still respects **user dismissed**. Active combat resolution uses **`game.combats.active`** with **`game.combat`** fallback.

- **Performance (journal / encounter lifecycle)**: **`EncounterToolbar.dispose()`** and **`JournalPagePins.dispose()`** tear down their prior per-feature DOM observers/intervals and HookManager registrations; **`Hooks.once('closeGame', …)`** in **`blacksmith.js`** invokes both. **`init()`** is idempotent on both managers. Removed debug **`console.log`** on **`renderJournalSheet`** in the journal double-click ready block. **`documentation/PERFORMANCE.md`**, **`performance.md`**, and **`TODO.md`** stack rows updated; duplicate journal monitoring consolidated (rank 3).

- **World settings**: Removed duplicate `movementType` registration that overwrote the intended default; single hidden setting now defaults to `normal-movement`, consistent with code fallbacks.
- **Menubar performance monitor**: Tool visibility now follows **Show Performance Monitor Tool** (`menubarShowPerformance`); label shows **client JS heap** (`Heap: X.X MB` or `Heap: N/A`) and updates on the same cadence as the session timer tick, with tooltip + click still opening the full performance notification. Re-renders when performance visibility or poll interval settings change.

### Documentation

- **Performance stack (rank 7)**: Updated `documentation/PERFORMANCE.md` and `documentation/performance.md` — pass 1 complete for no-op hooks, duplicate setting, and dead scroll branch; optional Regent/CSS follow-up noted. `documentation/TODO.md` stack table aligned.
- **Performance stack (rank 6)**: Documented native socket inbound teardown in `PERFORMANCE.md` / `performance.md` and `TODO.md` (stack row 6).


## [13.5.7] - 2026-03-14 - SETTINGS ORGANIZATION & CLEANUP

### Changed

- **Campaign settings hierarchy**: Reorganized the `Getting Started` campaign block so `Campaign Settings` is now the primary section with `Core`, `Geography`, and `Party` nested beneath it. `Campaign Name` now appears first in `Core`, followed by `Default Rulebooks`.
- **Party configuration model**: Replaced freeform party defaults as the primary source of truth with a declarative party setup. `Party Size` now drives party-member actor dropdowns, and prompt generation now derives party makeup and average level from the selected actors with legacy fallback support.
- **Rulebook configuration model**: Replaced rulebooks-as-text-only with a mixed model. `Number of Rulebooks` now drives rulebook compendium dropdowns, while the old text setting is now `Custom Rulebooks` for supplemental freeform sources.
- **Imports settings hierarchy**: Split import-related configuration out into a dedicated `Imports` section with `Item` and `Journal` subsections. Journal defaults are now grouped under `Narrative` and `Encounter`, while `Enhanced Image Guessing` now lives under `Imports > Item`.
- **Regent AI settings layout**: Restored missing top-level Regent settings headings by adding `AI Settings` and `OpenAI`, plus visible narrative headings in Regent so its settings page has the same structural treatment as Blacksmith where appropriate.
- **Encounter toolbar (journal)**: Items can wrap on narrow journal sheets; Deploy All is in the header next to the visibility badge and styled as a badge (span with `badge-deploy.deploy-monsters`). Removed unused `.encounter-btn` CSS.
- **Journal pins toolbar**: Pin Page is now the first button; the Image (use first image from page) icon option is second, immediately after Pin Page. Removed `margin-left: auto` from the Pin Page button so it stays at the start.

### Fixed

- **Regent duplicate cookie setting**: Removed the bad duplicate `Narrative Use Cookies` checkbox in Regent that was actually a misregistered `openAIContextLength` setting.
- **Regent/Blacksmith narrative default ownership**: Removed duplicate Regent registrations for Blacksmith-owned narrative import defaults (`defaultNarrativeFolder`, `narrativeDefaultCardImage`, `narrativeDefaultImagePath`) and updated Regent to read those values from Blacksmith instead.
- **Prompt default sourcing**: Narrative, encounter, item, table, and actor prompt helpers now use normalized campaign data instead of reading a mix of old raw settings directly.
- **Encounter actor folder sourcing**: Encounter-toolbar world-actor creation now uses the normalized campaign journal defaults instead of reading `encounterFolder` directly from raw settings.
- **Narrative scene parent replacement**: Blacksmith now fills the narrative prompt's existing `[ADD-SCENE-PARENT-HERE]` token from campaign geography instead of leaving it unresolved.
- **Encounter Reveal – tokens visible on canvas**: The encounter bar Reveal button now updates token documents via `scene.updateEmbeddedDocuments('Token', updates)` and refreshes token placeables so hidden NPC tokens become visible on the canvas for all clients.
- **Encounter Reveal – no hidden tokens found**: Reveal no longer required hostile disposition or strict NPC type; it now includes any hidden token that is not player-owned, so hidden NPCs with neutral or unset disposition are found and revealed. Tooltip updated to "Reveal hidden NPC tokens on the canvas".

### Added

- **Campaign subsystem**: Added `scripts/manager-campaign.js` to normalize campaign, geography, party, rulebook, and journal-default data from Blacksmith settings.
- **Campaign API**: Added `scripts/api-campaign.js` and exposed `module.api.campaign` as the public read-only contract for normalized campaign data.
- **Campaign API documentation**: Added [documentation/api-campaign.md](/c:/Users/drowb/AppData/Local/FoundryVTT/Data/modules/coffee-pub-blacksmith/documentation/api-campaign.md) so other Coffee Pub modules can migrate away from raw settings reads.
- **Richer prompt context**: Added `partyName` and `partyClasses` to the normalized campaign prompt context so Blacksmith prompts can consume more than just party size, level, and makeup.

## [13.5.6] - 2026-03-14 - CHAT CARD CLEANUP, TOKEN SETTINGS & NAMEPLATE REMOVAL

### Added

- **Hurry Up combat chat card**: The combat menubar `Hurry Up` action now posts a proper Blacksmith chat card instead of plain text, so it uses the normal Coffee Pub card styling/theme pipeline.
- **Token override enable gates**: Added `Enable Token Scale` and `Enable Image Fit Mode` so dropped-token scale and fit-mode overrides only apply when explicitly enabled.

### Changed

- **Chat card padding persistence**: `Remove Chat Card Padding` is now stored per Coffee Pub chat message at creation time so newer cards keep the wrapper behavior they were created with across refreshes.
- **Chat card padding fallback**: Startup/render fallback for `Remove Chat Card Padding` now defaults to keeping Foundry padding, matching the opt-in intent of the setting.
- **Token and chat settings organization**: The default Coffee Pub theme selector now lives under `Chat Cards`, and the `Chat Gap` slider range was tightened to `0..20`.
- **Live card theme catalog**: Renamed the neutral card theme display name from `Default` to `Tan` and added a new `Amber` theme with warm gold/brown narration-friendly accents.
- **Dropped token overrides**: Token scale and image fit mode settings now only apply when their new enable checkboxes are turned on.

### Removed

- **Optional menubar toggle**: Removed `Enable Menubar` from settings and the related runtime gating. The menubar is now treated as required.
- **Token nameplate styling feature**: Removed the non-functional `Token Nameplate Style` settings and all related runtime code after confirming the feature was not reliable in Foundry v13+.
- **Stale nameplate TODO**: Removed the obsolete documentation TODO entry for adding a nameplate-style enable setting.


## [13.5.5] - 2026-03-13 - TOKEN OWNERSHIP CLEANUP, COMBAT BAR FILTERING & CURATOR CLEANUP

### Added

- **Combat bar dead-token visibility option**: Added `Hide the Dead` for the combat menubar so defeated combatants remain in the combat tracker but are hidden from the combat portrait bar when enabled.
- **Blacksmith token indicator manager**: Added `scripts/manager-token-indicators.js` to own current-turn and targeted token indicators inside Blacksmith. The manager handles indicator rendering, animation, target clearing on turn change, native target-marker hiding, token movement updates, visibility refreshes, and live refresh when indicator settings change.
- **Blacksmith token rotation hook**: Restored token facing rotation as a Blacksmith-owned feature in `scripts/manager-canvas.js`, driven by the existing Blacksmith settings `enableTokenRotation`, `tokenRotationMode`, and `tokenRotationMinDistance`.
- **Coffee Pub chat card padding toggle**: Added `Remove Chat Card Padding`, a Coffee Pub-only chat setting that removes Foundry's wrapper inset around Coffee Pub chat cards without affecting standard Foundry messages.
- **Amber chat card theme**: Added a new `Amber` theme to the live chat-card theme catalog with warm gold and brown narration-friendly accents that still match the existing Blacksmith card family.
- **Project TODO tracking**: Added `todo.md` with a follow-up item to decide how Curator should handle asset defaults that currently point to Blacksmith paths.

### Changed

- **Indicator ownership restored to Blacksmith**: Current-turn and targeted indicator initialization now runs from Blacksmith instead of Curator, so the feature works without depending on Curator.
- **Combat bar refresh behavior**: Combat menubar now refreshes immediately when the new dead-token visibility setting is toggled.
- **Coffee Pub chat card wrapper handling**: Coffee Pub chat messages are now identified at chat-message creation/render time so wrapper-level styling can be applied only to Coffee Pub cards.
- **Theme settings rebuilt around live chat-card themes**: Removed the legacy theme-toggle model, rebuilt theme choices from the current `CHAT_CARD_THEMES` catalog, and moved the default Coffee Pub theme selector into `Chat Cards`.
- **Chat settings organization**: Renamed `Chat Adjustments` to `Chat Cards` and kept the card-presentation controls together in a single settings section.
- **Neutral theme naming**: Renamed the live neutral card theme display name from `Default` to `Tan` so the setting no longer reads like “default default.”
- **Chat gap bounds**: Tightened the `Chat Gap` slider range from `-20..60` to `0..20`.
- **Nameplate ownership cleanup**: Token nameplate handling now lives only in `manager-canvas.js`, which is the correct owner alongside other Blacksmith token behavior features.

### Removed

- **Obsolete chat card spacing sliders**: Removed the dead `Top/Bottom/Left/Right Padding` chat settings and the legacy `chatboxLoot` CSS path they depended on.
- **Obsolete chat top-offset setting**: Removed `Top Offset` and its unused runtime/CSS path from Chat Adjustments.
- **Curator orphaned indicator code**: Removed the old turn-indicator, targeted-indicator, and related token-visibility/movement helper code from Curator’s `token-image-utilities.js`.
- **Duplicate Blacksmith nameplate path**: Removed the legacy nameplate hook and helper functions from `scripts/blacksmith.js`; `CanvasTools` is now the single active nameplate path.
- **Curator migration fallback to old indicator key**: Removed the stale monster-mapping fallback in Curator that referenced the old `targetedIndicatorEnabled` key.
- **Obsolete window titlebar controls**: Removed the `Windows` titlebar size/spacing settings and their unused runtime/style path, since current Foundry window headers no longer need or honor those adjustments.

### Fixed

- **Coffee Pub chat card inset spacing**: Fixed the visible gap between Coffee Pub cards and the Foundry chat message wrapper by replacing the dead per-side card sliders with a Coffee Pub-only wrapper padding toggle.
- **Chat card padding persistence**: Coffee Pub cards now store their padding-removal choice in message flags at creation time, so new cards retain the wrapper behavior they were created with across refreshes.
- **Padding toggle startup fallback**: Fixed the render-time fallback for `Remove Chat Card Padding` so startup/refresh now defaults to keeping padding unless the opt-in setting is explicitly enabled.
- **Current turn and targeted indicators not showing**: Fixed a regression where indicator rendering stopped after the Curator split by moving ownership and initialization back into Blacksmith.
- **Blacksmith token rotation settings had no live implementation**: Fixed the structural gap where rotation settings remained in Blacksmith after the Curator cleanup but no runtime code still honored them.


## [13.5.4] - 2026-03-12 - PIN VISIBILITY, JOURNAL PINS & LOCATION IMPORT

### Added

- **Pin context menu – GM visibility toggle (independent of ownership)**: Added a GM-only `Visibility` submenu on pin right-click with `Visible` and `Not Visible`. This uses `pin.config.blacksmithVisibility` (not ownership) to control player visibility.
- **Journal page pin toolbar – image option**: Added a new `Image` icon option that uses the first image found on the selected journal page as the pin image (supports image pages and first `<img>` in text pages). File: `templates/toolbar-pins.hbs`, `scripts/journal-page-pins.js`.
- **Location journal import type**: Added a new import type `location` to the Journal Import flow, with full prompt/template support:
  - Template: `templates/journal-location.hbs`
  - Prompt: `prompts/prompt-location.txt`
  - Routing and rendering: `scripts/blacksmith.js`, `scripts/common.js`, `scripts/const.js`
- **Location journal card section**: Added a simple location card block after `Introduction` in `journal-location.hbs` (title = location name, image title field, same image as main location image, primary text above image, facts below image).

### Changed

- **Pin context menu order**: `Visibility` now appears in the core pin menu directly above `Animate`.
- **Journal page pin label source**: Journal-page pins now use the **page title** (`page.name`) for pin text instead of the parent journal name. Existing reused linked pins are also updated to the current page title when re-pinning.
- **Journal page pin toolbar layout**: Toolbar icon controls now wrap on smaller journal windows instead of overflowing.
- **Journal page pin toolbar option order**: The `Image` option is now last in the icon list.
- **Configure Pin – Use as Default**: Saved pin defaults now include `ownership` (who can access the pin) when "Use as Default" is enabled, so access settings persist in defaults.
- **Prompt filename correction**: Location prompt file path updated to `prompt-location.txt` (from `.xt` typo) in importer fetch logic.
- **Location prompt/schema updates**: `prompt-location.txt` now requires JSON output inside a fenced ```json code block, includes `journalname` in the schema, and documents importer defaults for omitted values (`foldername` -> `Libraries`, `journalname` -> `Locations`).
- **Location import mapping updates**: Location import now uses `journalname` for Journal Entry name while `title` remains the page title; if omitted, defaults are applied (`Libraries` folder, `Locations` journal). Location card fields are also mapped in importer logic (`cardimagetitle`, `carddescriptionprimary`, `carddescriptionsecondary`, with fallbacks).

### Fixed

- **GM pin opacity for Not Visible state**: Pins marked `Not Visible` now remain consistently at 50% opacity for GM (instead of briefly dimming then returning to full opacity) across render/update paths.
- **Pin config border thickness focus jump**: In Configure Pin, entering Border thickness no longer shifts focus to the border color text input (border wrapper changed from `<label>` to `<div>` in `templates/window-pin-config.hbs`).
- **Location card facts formatting**: When location card facts are provided as plain text, importer now normalizes them to an HTML list (`<ul><li>...</li></ul>`) for consistent rendering below the card image.
- **Image pin clipping at rounded border radius**: Fixed image pin clipping artifacts by matching image clip radius to the inner border radius (accounting for scaled border thickness), preventing top-edge clipping on rounded pins.


## [13.5.3] - 2026-03-03 - BALANCEBAR, REPUTATION & CHAT CARDS

### Added

- **Balancebar secondary bar item (API)**: New item kind `'balancebar'` for default secondary bars. Range -100 to +100 with origin at center; a **marker** (circle) indicates the value. Required: `width`, `borderColor`, `barColorLeft`, `barColorRight`, `markerColor`. Optional: `percentProgress` (default 0), `title`, `icon`, `leftLabel`, `rightLabel` (inside bar), `leftIcon`, `rightIcon` (outside bar), `height`, `onClick`, `contextMenuItems`. Update via `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, ... })`. Documented in `documentation/api-menubar.md`.
- **Display-only bar callbacks**: Progressbar and balancebar (and info) items support optional `onClick` for left-click and `contextMenuItems` (array or function) for right-click context menu. Secondary bar context menu handler extended so items with `contextMenuItems` show the menu; click handler invokes `onClick` for any item that has it (switch/toggle state only for buttons).
- **Manager-reputation.js**: Party reputation stored in **world setting** `blacksmithPartyData` (per-scene under `scenes[sceneId]` with `reputation`, `uuid`, `title`); reputation is a subset so other party data can be added later. `getPartyReputation(scene)`, `setPartyReputation(value, scene)`, load of `resources/reputation.json` for scale (label, description per band), `getScaleEntry(value)`, `registerPartyBarItem(api)`, `refreshPartyBarReputation(api)`. **Current Reputation** and **New Reputation** chat cards posted via chat card API (templates `cards-reputation-current.hbs`, `cards-reputation-new.hbs`) with scene name and scale data from JSON. Party bar Reputation balancebar registered from manager; right-click menu: Send Current Reputation, Increase by 5/1, Reset to 0, Decrease by 1/5 (each change posts New Reputation card).
- **Reputation API**: On `module.api`: `getPartyReputation`, `setPartyReputation`, `getReputationScaleEntry`, `postCurrentReputationCard`, `postNewReputationCard`. Documented in `documentation/api-menubar.md` (§ Reputation API).

### Changed

- **Progressbar icons**: Left/right icons (`leftIcon`, `rightIcon`) are now rendered **outside** the bar (siblings of the bar div), matching balancebar; CSS added for `.secondary-bar-item-progressbar-icon-outside-left` / `-outside-right`.
- **Balancebar icons**: Corrected placement so `leftIcon` appears on the left and `rightIcon` on the right (outside the bar).
- **Reputation context menu**: Party (non-GM) users only see **Send Current Reputation** in the reputation balancebar right-click menu; GMs see all options (send plus increase/decrease/reset). Tooltip updated to "Right-click for options."
- **Menubar on scene change (canvasReady)**: When the canvas becomes ready (including after the GM loads a scene), the menubar is always re-rendered so tool visibility reflects the current scene (e.g. combat bar button shows when the scene has active combat). If the party bar is open, party bar info (reputation, health) is refreshed. If the combat secondary bar is open but the new scene has no active combat, the combat bar is closed automatically.


## [13.5.2] - 2026-03-03 - PARTY BAR & PROGRESSBAR

### Added

- **Combat bar scroll arrows**: Left/right arrow buttons to scroll the portrait strip when it overflows. Arrows are shown only when the strip overflows (`.combat-portraits-overflowing`); scroll step = one portrait width + gap. Tracker, prev/next turn/round, scroll arrows, and Action (End Combat, etc.) sit inside `.combat-portraits-scroll-wrapper` next to each other. Menubar tool registered as `combat-bar` (secondary bar mapping `combat` → `combat-bar`). Combat bar styles moved to `styles/menubar-combatbar.css`; scroll arrows reuse shared button styling; control buttons use icons only with `data-tooltip` / `aria-label`.
- **Manager-party.js**: New `PartyManager` (`scripts/manager-party.js`) with `getActorHp(actor)` and `getPartyHealthSummary()` (sum of current/max HP across player-owned characters for progressbar). Exposed on `module.api` as `getPartyHealthSummary` and `getPartyActorHp`.
- **Progressbar secondary bar item**: New item kind `'progressbar'` for default secondary bars. Required: `width`, `borderColor`, `barColor`, `progressColor`, `percentProgress`. Optional: `title`, `icon`, `leftLabel`, `rightLabel`, `leftIcon`, `rightIcon`, `height`. Full bar = 100%; left/right labels are overlaid on the bar (do not shift or shrink it). Update via `updateSecondaryBarItemInfo(barTypeId, itemId, { percentProgress, leftLabel, rightLabel, ... })`. Documented in `documentation/api-menubar.md`.
- **Party bar layout and Party Health progressbar**: Party secondary bar **middle zone** = action buttons (Deployment Pattern, Deploy Party, Vote, Statistics, Experience). **Right zone** = Party Health progressbar: heart icon, "Party Health" label to the left of the bar, current/max HP overlaid on the bar (e.g. 616 | 767). Progressbar refreshes on register, when party bar opens, and on `updateActor` when party bar is open; data from `PartyManager.getPartyHealthSummary()`.
- **Clear Party (party bar and encounter bar)**: New `clearPartyFromCanvas()` in `utility-party.js` removes all party (player-owned character) tokens from the current scene; GM-only. **Party bar** has a "Clear Party" button in the middle zone (GM-only). **Encounter bar** has three new middle-zone buttons (GM-only): **Clear Party** (same behavior), **Clear Monsters**, and **Clear NPCs**.
- **Encounter bar – Clear Monsters and Clear NPCs**: `EncounterManager.clearMonstersFromCanvas()` in `manager-encounter.js` removes only non-humanoid NPC tokens from the canvas (humanoid NPCs e.g. merchants remain). `EncounterManager.clearNpcsFromCanvas()` removes only humanoid NPC tokens (e.g. merchants, guards); party and monster tokens are not removed. Both use D&D 5e creature type (`actor.system.details.type.value` or `details.creatureType`). Tokens with missing creature type are left unchanged.
- **Party leader / Vote helpers**: New `isCurrentUserPartyLeader(moduleId)` in `api-core.js`: returns true if the current user is the stored party leader (`partyLeader.userId`) or owns the leader's character (handles legacy data where userId was GM). Used for Vote button visibility, vote-config, vote-manager, and manager-toolbar leader checks.

### Changed

- **Party bar zones**: All party action buttons now explicitly use `zone: 'middle'`. Party health progressbar uses `zone: 'right'`.
- **Party leader dropdown**: `_getLeaderEntries()` in `api-menubar.js` now prefers a non-GM active owner for display, so the dropdown shows the logged-in player's name (e.g. "Favia Gita (Favia)") instead of "(Game Master)" when the player has ownership.
- **Combat bar**: `toggleCombatTracker()` added to MenuBar (uses `CombatTracker.isCombatTrackerOpen()`, `closeCombatTracker()`, `openCombatTracker()`). Combat bar overflow/scroll state and arrow disabled state updated via ResizeObserver, scroll listener, and after open (rAF + short delay).
- **Combat bar architecture (separation of concerns)**: Combat menubar orchestration was moved out of `api-menubar.js` into `scripts/manager-combatbar.js`. Combat bar registration now uses the public menubar API pattern (`registerMenubarTool('combat-bar')`, `registerSecondaryBarType('combat')`, and secondary-bar tool mapping) from the manager, matching other modules.
- **Combat bar scroll implementation location**: Smooth horizontal portrait scrolling helper logic was moved into `manager-combatbar.js` and no longer lives in a standalone `combat-bar-scroll.js`.
- **Combat bar endcap layout**: Right combat endcap width is now fixed to `175px`, and long combatant names in the lower endcap line truncate with ellipsis instead of wrapping.
- **Menubar button audio (global)**: Clicking a primary menubar button or a standard secondary-bar button now plays `SOUNDBUTTON04` at `SOUNDVOLUMESOFT`. Custom secondary bars (for example, combat) are excluded from this default secondary-bar click sound.
- **Vote visibility**: Vote button (party bar and vote icon state) and "can start vote" logic now use `isCurrentUserPartyLeader()`, so the party leader sees Vote and can start votes even when stored `partyLeader.userId` was set incorrectly (e.g. from an older dropdown).
- **World-setting writes by non-GMs**: `setNewLeader()` only calls `setSettingSafely('partyLeader', ...)` when `game.user.isGM`. `receiveLeaderUpdate()` no longer writes the setting on receiving clients (display-only; setting syncs from GM). `setSettingSafely()` in `api-core.js`: skips the set when the setting is world-scoped and the user is not a GM (checks `setting.scope` and `setting.config?.scope`); on any thrown error from `game.settings.set` when the user is not a GM, returns `true` so permission errors do not propagate. Leader dialog "None" path now uses `setSettingSafely` instead of direct `game.settings.set`.

### Fixed

- **Combat bar scroll – left arrow when portraits centered on load**: At-start/at-end no longer assume the first portrait is visible. Logic now uses "no content off-screen": at start when the first (leftmost) portrait's **right** edge is at or right of the viewport's left edge; at end when the last portrait's **left** edge is at or left of the viewport's right edge. Left arrow stays enabled when the strip is centered until the user has scrolled far enough left that the first portrait touches the viewport.
- **Combat bar portrait-scroll controls visibility and disabled state**: Scroll arrows now appear as a pair only when portraits overflow the container. When shown, each arrow is visually disabled only at its own boundary (leftmost/rightmost), and disabled buttons retain a normal arrow cursor instead of a "not-allowed" cursor.
- **Combat bar auto-scroll on turn advance**: Auto-scroll now runs only when the current combatant would otherwise be clipped/off-screen after turn/round changes, keeping the active portrait visible without unnecessary camera-like jumps.
- **Combat bar active-combat auto-show on load**: With "Automatically Show" enabled, the combat bar now also opens correctly when a client loads into an already-active combat (not only when combat is created during the session).
- **Combat tracker button handler**: Fixed click error `TypeError: menuBar.toggleCombatTracker is not a function` by routing tracker toggling through the combat bar manager path.
- **Combat bar control sounds**: Added sound hooks for combat controls: portrait scroll buttons use `SOUNDBUTTON09`; tracker toggle, previous/next turn, previous/next round, begin combat, end combat, and end turn use `SOUNDPOP02`.
- **Vote start error**: `VoteManager.startVote` debug log no longer references undefined `leaderData`; uses `getSettingSafely(MODULE.ID, 'partyLeader', null)` for the log payload.
- **Vote button on chat card**: `renderChatMessageHTML` hook callback is an arrow function so `this` was not `VoteManager`. Vote and Close handlers now call `VoteManager.castVote`, `VoteManager.closeVote`, and `VoteManager.activeVote` explicitly. Prevents "Cannot read properties of null (reading 'votes')" when clicking vote options in the chat card.
- **castVote after auto-close**: When the initiator's vote triggers "everyone voted" and `closeVote()` runs, `this.activeVote` is set to null before the code sent the vote update over the socket. `castVote()` now captures `votesToSync` (reference to `this.activeVote.votes`) before any `await` and uses it for `receiveVoteUpdate`, so the socket send no longer dereferences null.


## [13.5.1] - 2026-03-03 - MENUBAR REFACTOR & MANAGE UI

### Added

- **Manage UI flyout**: Start menu now includes a "Manage UI" submenu with "Show/Hide Interface" and "Enable/Disable Apply on Load". When Apply on Load is enabled, the core Foundry UI is automatically hidden when the client loads. New setting `canvasToolsHideUIOnLoad` (Themes & Experience group) and lang keys `canvasToolsHideUIOnLoad-Label` / `canvasToolsHideUIOnLoad-Hint`.
- **Secondary bar zones and info items**: The default secondary bar (tool-based system) now has **left**, **middle**, and **right** zones. Items can specify `zone: 'left' | 'middle' | 'right'` (default `'middle'`). Existing items without a zone default to middle for backward compatibility. **Info items** (`kind: 'info'`) are display-only: register with `label` and/or `value`, and update at any time with `updateSecondaryBarItemInfo(barTypeId, itemId, { value, label, borderColor, buttonColor, iconColor })`. This allows encounter-style bars (info on the sides, actions in the center) without custom templates. New API: `updateSecondaryBarItemInfo`, `hasQuickEncounterTool`, `openQuickEncounterWindow`. See `documentation/api-menubar.md` (§ Default Bar Zones and Item Kinds, § Updating Secondary Bar Info Items).
- **Encounter bar migration**: Encounter secondary bar now uses the default tool system (zones + info items + buttons) instead of a custom template. **Right zone**: Party CR, Monster CR, Difficulty (info items, updated when tokens change). **Middle zone**: Create Combat, Quick Encounter (when available), Reveal (GM-only buttons). **Left zone**: empty. Owned by `encounter-toolbar.js`; `menubar-encounter.hbs` removed. Difficulty badge shows icon + rating only (no "Difficulty" label), with icon and text colored by `EncounterManager.getDifficultyBorderColor()`; no border.

### Changed

- **Encounter difficulty badge**: Removed label "Difficulty"; badge now shows icon + rating only. Icon and value text both use difficulty rating color (`iconColor`). Border removed.
- **Info item `iconColor`**: `updateSecondaryBarItemInfo` now accepts `iconColor` (and `null` to clear). When set, both icon and value text use the color. Documented in `api-menubar.md`.
- **Menubar architecture**: Core left-zone tools (start menu, Settings, Refresh) are no longer registered inside `api-menubar.js`. They are now registered from `utility-core.js` via the public menubar API (`game.modules.get(...).api.registerMenubarTool`), matching the pattern used by external modules.
- **Ready-cycle timing**: Menubar API is bound synchronously at the start of Blacksmith's `ready` handler (before any `await`) so all ready callbacks can use it. `registerSettings()` is called before the first `await` so settings exist when utility-core and other callbacks run. `MenuBar.initialize()` is invoked at the start of ready (without await) and registers its own `Hooks.once('ready')` before any await so the menubar renders in the same ready cycle. Menubar API is re-applied after the main API merge so it is not overwritten by nulls.

### Removed

- **Encounter bar height fallback**: Removed `--blacksmith-menubar-secondary-encounter-height` from `styles/menubar.css`; encounter bar uses registration config height only, consistent with other modules.

### Fixed

- **Start menu / menubar not showing**: MenuBar's ready callback was registered after `await this._registerPartials()`, so when Blacksmith's ready yielded, the callback was never registered in time. The ready hook is now registered at the top of `MenuBar.initialize()` and async work (partials, loadLeader, registerDefaultTools, renderMenubar) runs inside that callback so the menubar renders correctly.
- **Apply on Load setting not registered**: utility-core's ready could run before `registerSettings()`, causing "canvasToolsHideUIOnLoad is not a registered game setting". Settings are now registered before the first await, and utility-core checks `game.settings.settings.has()` before reading the setting.


## [13.5.0] - 2026-03-08 - CURATOR MIGRATION

### Changed

- **Curator Migration**: Extracted Token Image Replacement, Portrait Image Replacement, Dead Token conversion, and Loot generation functionality into the new **Coffee Pub Curator** module. Blacksmith now exposes these features via integration when Curator is installed.
- **API Menubar Updates**: `api-menubar.js` now dynamically checks for the `coffee-pub-curator` module to populate token replacement and dead token context menu items.
- **Documentation Updates**: Updated `architecture-blacksmith.md` and `extraction-reassessment.md` to reflect the new Curator module. Renamed and updated `migration-curator.md` with the finalized migration plans.

### Removed

- **Loot Generation Code**: Removed `manager-image-cache.js`, `token-image-replacement.js`, `token-image-utilities.js`, `loot-utilities.js`, `ui-context-menu.js`, and all associated CSS/HBS files. These are now fully handled by Curator.
- **Settings and Localization Cleanup**: Removed all settings related to token image replacement, data weights, loot generation, dead tokens, and epic loot odds from Blacksmith's `settings.js` and `lang/en.json`.
- **Legacy Regent Cleanup**: Removed the unused `styles/panel-assistant.css` leftover from the Regent migration, including its import in `styles/default.css` and mentions in the architecture documentation.
- **Dead Migration Files**: Removed the old `_Migration` folder containing outdated backup files (`pin-icons.json`, `pin-transition.md`, `panel-notes.js`, etc.).


## [13.4.1] - 2025-03-03

### Changed

- **Herald/Broadcast cleanup – CSS and TODO**: Removed `--blacksmith-menubar-secondary-broadcast-height` from `styles/menubar.css` (broadcast bar height is now provided by Herald when it registers its secondary bar type). Removed the CRITICAL REVISIT TODO for this variable from `documentation/TODO.md`. Deleted `documentation/cleanup-broadcast-herald-legacy.md` (cleanup complete). Blacksmith no longer owns any broadcast bar configuration.

## [13.4.0] - 2025-03-03

### Added

- **Menubar Control API**: Exposed `renderMenubar(immediate)` so external modules can request a menubar re-render when settings or state change. Added `registerMenubarVisibilityOverride(moduleId, callback)` and `unregisterMenubarVisibilityOverride(moduleId)` so modules (e.g. Herald) can hide the menubar for specific users (e.g. broadcast/cameraman). Documented in `documentation/api-menubar.md` § Menubar Control API.
- **Secondary bar API**: Implemented `registerSecondaryBarTool(barTypeId, toolId)` in MenuBar (`api-menubar.js`). This method was already exposed on `module.api` but was missing from MenuBar; it registers which menubar tool toggles a given secondary bar so the menubar can sync the tool’s active state when the bar opens/closes. Documented in `documentation/api-menubar.md` § Registering Secondary Bar Toggle Tool.

### Changed

- **Broadcast – migrated to Coffee Pub Herald**: Broadcast (streaming/cameraman view, view modes, menubar visibility override) is now provided by the **Coffee Pub Herald** module (`coffee-pub-herald`). Blacksmith no longer initializes BroadcastManager; it only exposes the menubar visibility override API and secondary bar API that Herald uses. See Herald’s documentation and `documentation/registering-with-blacksmith.md` for integration.
- **Documentation – architecture and cleanup**: `documentation/architecture-blacksmith.md` — removed BroadcastManager from init list; Broadcast subsection now points to Coffee Pub Herald; removed broadcast from CSS import list and from god-module responsibilities; references table row "Broadcast mode" now points to Herald. `scripts/api-menubar.js` — comment updated from "BroadcastManager or Herald" to "Herald". `documentation/TODO.md` — "Tune Default Zoom Levels for Broadcast Modes" and "Broadcast: Combat Spectator Mode" removed (moved to Herald); added critical revisit for `--blacksmith-menubar-secondary-broadcast-height` in `styles/menubar.css` (decide whether Blacksmith or Herald should own it). `documentation/cleanup-broadcast-herald-legacy.md` — checklist marked complete.

### Fixed

- **Roll Configuration and Request a Roll – missing partial-unified-header**: When Regent was split into its own module, the unified header partial moved with Regent. Blacksmith's Roll Configuration window (`window-roll-normal.hbs`) and Request a Roll dialog (`window-skillcheck.hbs`) still reference `{{> "partial-unified-header" }}`, causing "partial partial-unified-header could not be found" on the published server. The partial (`unified-header.hbs`) is now copied back into Blacksmith at `templates/partials/unified-header.hbs` and registered at init as `partial-unified-header` via `_registerUnifiedHeaderPartial()` in `blacksmith.js`, before the roll system loads.
- **Pin "Use as Default" – event animations and sounds not saved**: When "Use as Default" was checked in Configure Pin, the saved design only included size, shape, style, text options, and allowDuplicatePins. Event animations and sounds (hover, click, double-click, add, delete) were omitted. The design object now includes `eventAnimations` so new pins of that module and type inherit the animations and sounds. Fix in `window-pin-config.js`.

### Removed

- **Broadcast feature**: Removed BroadcastManager, `scripts/manager-broadcast.js`, broadcast settings and language keys, broadcast CSS import, and all Broadcast-specific menubar registration from Blacksmith. Streaming and broadcast view are now provided by **Coffee Pub Herald** (`coffee-pub-herald`). Install and enable Herald for cameraman view, view modes, and broadcast bar.
- **Test V2 Window**: Removed dev-only test window (`scripts/window-test-v2.js`), its Window API registration (`blacksmith-test-window`), and the "Test V2 Window" toolbar button from the GM tools zone. The Application V2 template (`window-template.hbs`) and base class remain for real windows.


## [13.3.1] - 2026-03-05

### Fixed

- **Request a Roll API – GM-authoritative completion signaling**: `openRequestRollDialog({ onRollComplete })` integrations now work reliably when requests are initiated by players. Roll completion is now propagated across clients through a shared completion signal path, so GM-side consumers can resolve game state (scene flags, actor updates, etc.) without depending on callback ownership on the originating client.

### Changed

- **Request a Roll completion hook**: Added global hook `blacksmith.requestRollComplete` for cross-client integrations. Payload includes `messageId`, `message`, `messageData`, `tokenId`, `result`, `allComplete`, `requesterId`, and `rollerUserId`. Existing `onRollComplete` callback behavior remains supported for backward compatibility.
- **Request a Roll docs**: Updated `documentation/api-requestroll.md` to document local `onRollComplete` behavior vs. cross-client hook usage and the full completion payload contract.
- **Movement sound – play once per move**: Token movement (walking) sound no longer uses start/stop looping; the sound never stopped when movement ended. It now plays once per movement update when the token moves beyond the distance threshold. A TODO was added in `documentation/TODO.md` to fix the movement sound start/stop behavior (loop while moving, stop when idle) in a future release.
- **Party secondary bar – player visibility**: In the party menubar (player secondary bar), players now see only **Vote** (when they are the session leader) and **Statistics**. Deployment pattern, Deploy Party, and Experience are visible only to the GM. Vote is visible to the GM or the current session leader. Implemented via `visible` on party secondary bar items in `api-menubar.js` (`_registerPartyTools`).


## [13.3.0] - 2025-02-27

### Fixed

- **Roll Configuration window – closes after roll from chat card**: When a player clicked the roll button on a request-roll chat card and then rolled from the Roll Configuration window (advantage, normal, or disadvantage), the window sometimes stayed open. The window now always closes after a roll attempt: the success path closes the dialog once results are delivered, and the catch path now closes the dialog on error so the user is not left with a stuck window. Fix in `RollWindow._executeRoll()` (manager-rolls.js).

### Removed

- **OpenAI API and AI code from Blacksmith**: Removed `scripts/api-openai.js` and all OpenAI integration from the core module. The `module.api.openai` surface no longer exists on Blacksmith. AI tools (Consult the Regent, worksheets: Lookup, Character, Assistant, Encounter, Narrative) are now provided only by the optional module **coffee-pub-regent**, which registers its toolbar tools via Blacksmith’s toolbar API and exposes the OpenAI API on its own `module.api.openai`.

### Changed

- **Documentation**: `documentation/architecture-blacksmith.md` — load order and bootstrap no longer reference `api-openai.js` or `OpenAIAPI`; API table no longer lists `openai`; added pointer to coffee-pub-regent for AI/Regent features and link to `coffee-pub-regent/documentation/api-openai.md`. `documentation/api-core.md` — AI/OpenAI API link now points to Coffee Pub Regent’s OpenAI API doc instead of a Blacksmith-local api-openai.md. Consumers of the OpenAI API should use `game.modules.get('coffee-pub-regent')?.api?.openai` when the Regent module is enabled.
- **Window API and Application V2 guidance**: `documentation/api-window.md` — added “Application V2: Body injection and scripts” (scripts in injected body/partials do not run; use document-level delegation for body controls; options for legacy inline `onclick`). Troubleshooting now includes “Buttons or controls in the body do nothing” with pointer to that section. `documentation/architecture-window.md` — new §2a “Application V2 behavior: body injection and scripts” (injected `<script>` not executed; use delegation for body controls; two patterns for legacy inline handlers). `documentation/applicationv2-window/guidance-applicationv2.md` — new §3.6 “Inline onclick or script in a partial never runs” and §4 bullet that scripts in injected body/partials do not run (use delegation or register handlers on `window` from a load-time module).

## [13.2.13]

### Added
- **Request a Roll API – situational bonus and custom modifier**: `openRequestRollDialog(options)` now accepts `options.situationalBonus` (number) and `options.customModifier` (string). These values pre-fill the Roll Configuration window when a player opens it from the chat card. When using `options.actors` (silent or dialog), each actor may include `situationalBonus` and `customModifier` for that actor only; if omitted, the global options apply. Use per-actor modifiers when only some actors get a bonus (e.g. one of two players has +2 for harvest). Documentation: `api-requestroll.md` updated with parameters and examples.
- **Chat Card API – section-header**: Documented `.section-header` in `api-chatcards.md` as the sub-heading inside the card (e.g. "Requested Rolls", "Challengers"). Card structure table and examples now include section-header; theme preview and Handlebars templates updated.

### Changed
- **Roll Configuration window – default size**: Default dimensions changed from 500×450 to 600×500 (manager-rolls.js `RollWindow.defaultOptions`). Window remains resizable.
- **Request a Roll API – groupRoll and multiple actors**: Clarified `groupRoll` behavior in docs: when omitted, dialog mode leaves the checkbox unchecked; silent mode defaults to group roll when multiple actors are supplied unless `groupRoll: false` is passed.
- **Movement sound – same “movement stopped” rule as marching order**: Token movement sound now treats “movement stopped” as “no `updateToken` for N ms” (300 ms debounce), matching the marching-order logic in the same file. Removed the libWrapper on `Token.prototype._onDragLeftDrop`, the `stopToken` hook for movement sound, and the pending-stop workaround. Start/stop is driven only by `updateToken` and a per-token debounce timer so sound works consistently for drag and keyboard. Multiple tokens can still play movement sound at once (keyed by tokenId). Added defensive `tokenDocument._source?.x` / `_source?.y` fallbacks and try/catch in `handleMovementSounds`; when sound starts, a console message “Movement sound: started” is logged (not gated by debug).
- **Narrative journal – scene fields "None" handling**: `sceneparent`, `scenearea`, `sceneenvironment`, `scenelocation`, and `scenetitle` now treat `"None"` (case-insensitive), blank, or null as empty; those fields are omitted from the journal output so "(None)" never appears. `omitIfNone()` helper in common.js; prompt-narratives.txt updated to instruct that None or empty means omit.
- **Narrative journal – section intro and context intro HTML rendering**: `strSectionIntro` and `strContextIntro` now use triple braces in journal-narrative.hbs so HTML (e.g. `<ul><li>...</li></ul>`) renders instead of showing raw tags. Section intro wrapper changed from `<p>` to `<div class="narrative-section-intro">` to support block-level content.
- **Narrative journal – per-section context fields**: `contextadditionalnarration`, `contextatmosphere`, and `contextgmnotes` are now per-section (inside each section object) in the JSON structure. The template renders Extended Narrative, Notes and Strategies, and Atmosphere inside each section after its cards. Top-level values still apply as fallback when a section omits its own. Prompt updated; backward compatible with existing top-level context.

### Fixed
- **Global debug setting – debug messages no longer log when off**: `postConsoleAndNotification()` in api-core.js previously logged every call: the debug branch (with "DEBUG" in the title) ran only when both `blnDebug === true` and `COFFEEPUB.blnDebugOn` were true, but the "normal" branch ran for all other cases and always called `console.info`. So messages marked as debug still appeared when global debug was unchecked. An early return was added: when `blnDebug === true` and `!COFFEEPUB?.blnDebugOn`, the function returns without logging or notification. Debug-marked messages now only appear when the module’s global Debug Mode setting is on.
- **Encounter Toolbar – "Context around UUID" respects debug**: The "Context around UUID" log in encounter-toolbar.js was called with `blnDebug: false`, so it always logged. It now passes `blnDebug: true` so it is suppressed when global debug is off.

## [13.2.12]

### Fixed
- **Sound constants on BlacksmithConstants**: External modules calling `BlacksmithUtils.playSound(BlacksmithConstants.SOUNDNOTIFICATION01, 0.7)` received "playSound called with invalid sound: sound" because sound path constants (SOUNDNOTIFICATION01, SOUNDVOLUMENORMAL, etc.) lived only on `COFFEEPUB`, not on `api.BLACKSMITH` (exposed as `BlacksmithConstants`). When the API is built, `assetLookup.getAllConstants()` is now merged onto `BLACKSMITH` so `BlacksmithConstants.SOUNDNOTIFICATION01` and other generated constants exist and playSound works when used from other modules.

## [13.2.11]

### Added
- **Sound API – duration option**: Optional 5th parameter `duration` (seconds) on `playSound(sound, volume, loop, broadcast, duration)`. When set, the sound loops for that many seconds then stops. When `broadcast` is true, all clients stop after the duration via socket (`playSoundWithDuration` handler). New `playSoundLocalWithDuration(sound, volume, duration)` for local timed playback. Socket handler registered in manager-sockets; manager-utilities wrapper and API doc (`api-core.md`) updated with Sound playback subsection and duration examples.
- **Item import – straight-quote normalizer**: Prompts (Artificer, consumables, loot) now instruct to use only straight ASCII apostrophes (') and no curly/typographic apostrophes or smart quotes. New `normalizeStraightQuotesForJson(str)` in blacksmith.js replaces curly/smart single and double quotes (U+2018, U+2019, U+201A, U+201B, U+2032, U+201C–U+201F) with straight equivalents; applied to the item JSON string before `JSON.parse()` in the Item Directory import dialog so pasted or file-loaded JSON parses correctly even when the model outputs typographic quotes.


## [13.2.10]

### Added
- **Menubar overflow button**: When the middle zone has more tools than fit, a right-justified ellipsis icon appears; clicking it opens a dropdown with the overflowed tools. Overflow detection uses ResizeObserver and updates on window resize.
- **Request a Roll API – silent mode**: `openRequestRollDialog({ silent: true, ... })` creates the roll request and posts it to chat without opening the dialog. Requires `initialValue` or `initialSkill`; actors come from `initialFilter` ('party' | 'selected') or from `options.actors`. Returns a Promise resolving to `{ message, messageId }`. If no actors are found, the API falls back to opening the dialog and resolves with `{ message: null, messageId: null, fallbackDialog }`. `options.actors` accepts Foundry Actor documents (resolved to canvas tokens by actor id) or token-centric objects `{ id: tokenId, actorId, name, group }`. Documentation: `documentation/api-requestroll.md` updated with silent mode, callback payload, and accepted actor shapes.

### Changed
- **Menubar – Vote, Statistics, Experience moved to Party bar**: Vote, Party Statistics, and Experience are now in the party secondary menubar instead of the primary menubar. Open the party bar to access them.
- **Menubar notifications**: Notifications are right-justified and the notification area now flexes to the size of its contents.

### Fixed
- **Skill Check dialog – undefined hp crash**: When opening the Request a Roll (Skill Check) dialog, actors without `system.attributes.hp` (e.g. vehicles, some NPCs, or alternate data structures) caused "Cannot read properties of undefined (reading 'value')". `getData()` now uses optional chaining and fallbacks for `hp`, `level`, and `class` so the dialog renders safely for all actor types.
- **Request a Roll API – onRollComplete not invoked**: When another module opened the dialog with `onRollComplete`, the callback was never called after players rolled. Callbacks are now stored by message id when the roll request is created and invoked from `handleSkillRollUpdate` when results are delivered; payload is `{ message, messageData, tokenId, result, allComplete }`. Callback is removed when `allComplete` is true.
- **Request a Roll – handleSkillRollUpdate type check**: The guard `if (!flags?.type === 'skillCheck')` was always false (wrong operator precedence). Replaced with `if (flags?.type !== 'skillCheck')` so non–skill-check messages are skipped correctly.
- **Skill Check dialog – _getToolProficiencies and getData()**: In v13, `this.element` can be native DOM or unset during `getData()`. `_getToolProficiencies()` now normalizes element (jQuery vs native), guards with `if (!element || typeof element.querySelectorAll !== 'function') return []`, and uses `querySelectorAll`/`forEach` so the tool list populates correctly and no "Cannot read properties of undefined (reading 'querySelectorAll')" occurs. Canvas access in `getData()` and `activateListeners()` now uses `canvas?.tokens?.placeables ?? []` and `canvas?.tokens?.controlled` with optional chaining to avoid errors when no scene or canvas is ready.
- **Request a Roll (silent) – options.actors with Actor documents**: Silent mode treated `options.actors` as token-centric only (`id` = token id, `actorId` required), so callers passing Actor documents (e.g. from `_getSelectedCanvasActors()`) were filtered out and "no actors found" was thrown. The API now accepts both token-centric objects and Actor documents (or `{ id: actorId, name }`); for actor-centric items it resolves each to canvas token(s) by actor id and builds the roll request from those tokens.


## [13.2.9]

### Added
- **Request a Roll API – groupRoll option**: `openRequestRollDialog(options)` now accepts `options.groupRoll` (boolean). When the dialog is opened via the API, if `groupRoll` is omitted it defaults to false (unchecked); when opened from the UI, the saved preference is used. JSDoc and `documentation/api-requestroll.md` updated.
- **Wildcard token path resolution**: Foundry’s multiple-variant token paths (e.g. `arch-hag-*.webp`) are now resolved to a concrete file for display. New `resolveWildcardPath(path)` in api-core.js (FilePicker browse + regex + random match). Encounter toolbar: portrait in `_getMonsterDetails()` is resolved when it contains `*`. Token deployment: `deployTokensSequential()` resolves `previewTokenData.textureSrc` before showing the placement ghost so the ghost and result cards use a real path.
- **Image Replacement – Tag Match weight**: New slider in Image Replacement Data Weights (0–100, default 25) controls how much file tag overlap contributes to relevance. Matching now scores overlap between token/actor data (and, in portrait mode, token image filename words) and the file’s primary/secondary tags; this weight makes tags (e.g. female, scholar, farmer) tunable for both token and portrait results. Setting: `tokenImageReplacementWeightTags`; lang: "Tag Match" with hint.
- **Image Replacement – Portrait uses token image filename**: Portrait matching now uses words from the token’s current image path as extra context. When a portrait is chosen for a token (or on "update dropped"), words are extracted from the token texture filename (e.g. `female-farmer-01.webp` → female, farmer) and merged into tag matching, so portraits that share those words in name or tags rank higher. New helper `ImageCacheManager.extractWordsFromTokenFilename(path)`; token filename terms passed into `_applyUnifiedMatching` / `_calculateRelevanceScore` in the portrait window flow and in `_processPortraitImageReplacement`.
- **Image Replacement – Tag match sum scoring**: Tag contribution to relevance now sums each matching tag’s score instead of taking the best single match, so files with more tag matches (e.g. female + farmer) rank above those with fewer (e.g. farmer only).
- **Image Replacement – Filter garbage tags**: New setting "Filter Garbage Tags" (default on) skips adding tags that look like dimensions (16X32), variant codes (001A, A1), or all-digit parts when scanning. New setting "Ignored Tag Patterns" (comma-separated, * wildcard) lets users exclude additional tags. Both apply to token and portrait scanning. `GARBAGE_TAG_PATTERNS` and `_isGarbageTagPart()` in manager-image-cache.js; `_shouldIgnoreTagByPattern()` for custom patterns.

### Changed
- **Image Replacement – Unified ignore settings**: One set of "Ignored Folders", "Ignored Words", and "Deprioritized Words" (under Token Image Replacement) now applies to both token and portrait. Removed portrait-specific settings: portraitImageReplacementIgnoredFolders, portraitImageReplacementIgnoredWords, portraitImageReplacementDeprioritizedWords. Lang hints note they apply to both.
- **Image Replacement – Monitor folder removed**: Removed "Monitor Image Folder for Changes" (auto-update) for both token and portrait. Cache is no longer checked for folder changes on load; scans run only when the user clicks "Update Images" in the replacement window. Removed tokenImageReplacementAutoUpdate and portraitImageReplacementAutoUpdate and _checkForIncrementalUpdates().

### Fixed
- **Image Replacement – %20 in tags**: FilePicker can return URL-encoded paths (e.g. `%20` for spaces). Added `_safeDecodePath(path)` in manager-image-cache.js and decode at the start of `_processFileInfo()` so metadata and tags use readable names (spaces instead of `%20`).
- **Image Replacement – dropdown white on tan**: Sort dropdown options (e.g. "Sort by Relevance", "Alphabetical: A to Z") now use the dark theme (background `#232323`, color `#e0e0e0`); selected option uses the green accent. Styling in `window-token-replacement.css` for `select option` and `option:checked`.
- **Token Image Replacement – storeOriginalImage on create**: When tokens are created (e.g. during encounter deployment), `tokenDocument.texture.src` can be null. `TokenImageUtilities.storeOriginalImage()` now guards on `texture.src` (and `texture.path`) and returns without storing when missing, preventing "Cannot read properties of null (reading 'split')".

## [13.2.8] - Release fix

## [13.2.7]

### Added
- **Request a Roll API**: The Request a Roll (Skill Check) dialog is exposed for other modules. `module.api.openRequestRollDialog(options)` and `BlacksmithAPI.openRequestRollDialog(options)` open the dialog with optional pre-fill. Options: `title` (dialog window and roll/card header), `initialType` (`'skill'` | `'ability'` | `'save'`), `initialValue` or `initialSkill` (id or friendly name, e.g. `'perception'`), `dc`, `initialFilter` (`'party'` | `'selected'`), plus `callback`, `onRollComplete`, `actors`. When `initialFilter` is `'party'`, all visible party actors are pre-selected as challengers; when `initialType`/`initialValue` are set, the correct tab is shown and that roll type is pre-selected (friendly names like `'perception'` are resolved to system CONFIG ids, e.g. `prc`). Documentation: `documentation/api-requestroll.md` with full parameter table, examples (including party perception DC 12), and roll type reference.

### Changed

### Fixed
- **Request a Roll – dialog and card title**: The API `title` option was not applied to the dialog window (options are now passed into `super(options)` so the Application uses it) and was not used for the chat card header. The passed `title` is now stored as `apiRollTitle` and used as `messageData.rollTitle` when creating the roll request, so both the dialog title and the card's main title show the custom text (e.g. "Spot the trap").
- **Request a Roll – party and skill pre-selection**: With `initialFilter: 'party'`, only the Party tab was active; party actors were not selected as challengers. Now all visible party actor items are given the challenger state (selected, cpb-group-1, swords icon) and `_updateToolList()` is called. With `initialType`/`initialValue` (e.g. Perception), the Skill tab was shown but the skill item was not selected because the dialog defaulted to the Quick tab and the selector used a friendly name instead of the system id. The roll-type filter is now set to the correct tab (skill/ability/save) before selecting the item, and `_resolveRollTypeValue(type, value)` resolves friendly names (e.g. `'perception'`) to CONFIG ids (e.g. `'prc'`) so the matching list item is found and selected.

## [13.2.6]

### Added
- **Monster deployment API**: Encounter toolbar’s monster/NPC deployment is exposed so other modules can deploy to the canvas (GM only). `module.api.deployMonsters(metadata, options)` and `BlacksmithAPI.deployMonsters(metadata, options)` accept `metadata`: `{ monsters?: Array<string|{uuid}>, npcs?: Array<...> }` and optional `options`: `deploymentPattern`, `deploymentHidden`, `position` `{ x, y }` (skips click-to-place), `isAltHeld`. Encounter toolbar: public `deployMonsters(metadata, options)` and `_deployMonsters(metadata, overrides)` with overrides for pattern, hidden, and position. Token API: `normalizeActorUUIDs(actorUUIDs)` and `deployTokens` / `deployTokensSequential` now accept UUID strings or objects with `.uuid`. Documentation: `api-core.md` “Monster deployment API” section and “Available now” bullet.
- **Journal page pins**: Journal page sheets now get a “Pin page” header control (with hook + MutationObserver fallback) that creates or reuses an unplaced Blacksmith pin of type `journal-page`, enters click-to-place mode with crosshair cursor (Esc/right-click to cancel), reloads pins after placement, and stores `pinId`/`sceneId` on the page. Double-clicking a placed journal-page pin opens its linked journal page.
- **Token placement preview**: During token deployment (sequential or single-token batch), a ghost token now follows the cursor so the user can see the token's size and grid footprint before clicking. `getTargetPosition(allowMultiple, options)` accepts optional `options.previewTokenData`: `{ width, height, textureSrc }`. New helper `getPreviewDataFromActor(actor)` returns that data from an actor's prototype token. Sequential deployment passes preview data per token; the ghost is drawn on the token layer, snaps to grid, and is removed on click or cancel.

## [13.2.5]

### Added
- **Pin label “Chars per line”**: New setting in Configure Pin (TEXT FORMAT) to limit characters per line before wrap; breaks at word boundary. Value is a character count (e.g. 15 or 100); 0 = single line. Stored as `textMaxWidth` on pin data. Schema, config window, renderer, manager merge, and API docs updated.
- **Pin center text (`iconText`)**: Pins can now use plain text in the center instead of an icon or image. Pass `iconText: '1'` (or any string) to display text in the pin; it inherits the same styling as Font Awesome icons (iconColor, scaling). `iconText` takes precedence over `image` when both are set. Schema, renderer, manager merge, and API docs updated.
- **Image Replacement “Update Canvas” action**: Added a button beside the Delete/Scan controls that re-runs token/portrait replacements for every token on the canvas while honoring the existing enabled switches, filters, and variability logic so a GM can refresh a scene without re-dropping tokens.
- **Roll table prompts – compendium items by rarity**: The “[ADD-COMPENDIUM-ITEMS-HERE]” list (Copy Template → Compendium Items) now groups items by D&D 5e rarity under each compendium. Uses full item documents (`getDocuments()`) and `system.rarity`; output format is compendium id, then “RARITY: Common”, “RARITY: Uncommon”, etc., each followed by comma-separated item names. Helpers: `getItemRarityKey`, `formatRarityLabel`, `ITEM_RARITY_ORDER`. Prompt text updated to describe the grouped format.
- **Roll table prompts – compendium actors by CR**: The “[ADD-COMPENDIUM-ACTORS-HERE]” list (Copy Template → Compendium Actors) now groups actors by Challenge Rating under each compendium. Uses full actor documents and `system.details.cr` (or `.value`); output format is compendium id, then “CR: 0”, “CR: 1/8”, “CR: 1/4”, etc., each followed by comma-separated actor names. Helpers: `getActorCr`, `formatCrLabel`, `parseCrToNumber`, `CR_SORT_OTHER`. Prompt text updated; typo “compendiume” fixed.
- **Combat assessment API**: Party CR, monster CR, and encounter difficulty (same logic as the encounter toolbar) are now exposed for other modules. On `module.api`: `getPartyCR()`, `getMonsterCR(metadata)`, `calculateEncounterDifficulty(partyCR, monsterCR)`, `getCombatAssessment(metadata)` (returns `{ partyCR, monsterCR, partyCRDisplay, monsterCRDisplay, difficulty, difficultyClass }`), plus `parseCR` and `formatCR`. Encounter toolbar: new public `calculateEncounterDifficulty()` and `getCombatAssessment()`. Drop-in bridge (`BlacksmithAPI`): `getCombatAssessment()`, `getPartyCR()`, `getMonsterCR()`, `calculateEncounterDifficulty()`. Documentation: `api-core.md` updated with “Combat assessment API” section and usage examples.

### Changed
- **Pin label “Max length” → “Max characters”**: Configure Pin TEXT FORMAT field renamed from “Max length” to “Max characters” (still truncates label text at that character count with ellipsis; 0 = no limit).
- **Pin label wrap – character-based only**: When Chars per line &gt; 0, the label element’s width is set to `${textMaxWidth}ch` so wrapping is driven by character count, not the pin’s pixel width. Label is no longer constrained by the pin container (~53px); `white-space: pre-line` and our word-boundary newlines (or browser wrap within the `ch` width) control line breaks.
- **Image Replacement tags split**: Image cache now keeps tiered tags (`primaryTags` for structured metadata + `secondaryTags` for the remaining filename/folder keywords plus a `tagTypes` map) so both cache storage and the UI know which tags come from the spinner-controlling sliders vs. descriptive leftovers. The Image Replacement window renders primary/secondary rows, counts/sorts tags per group, and favorites use the new tag helpers; a TODO hints at a future right-click menu for tag actions such as “Add to Ignored.”
- **Image Replacement cache now warns instead of deleting**: Token/portrait caches stay loaded when metadata (version, configured roots, fingerprint) drift, `_checkForIncrementalUpdates` just marks the new `needsRescan` flag, and the UI surface now shows an info banner advising the GM to rescan—your previous cache isn’t deleted and the 30-day auto-expiry was removed, so it only rebuilds when someone explicitly hits “Scan for Images.”

### Fixed
- **Chars per line not applied**: `textMaxWidth` was only accepted when `typeof === 'number'`, so values from storage or form (e.g. string `"100"`) were dropped. Schema `applyDefaults()` and manager `_applyPatch()` now coerce number or string to a non-negative integer so the setting is persisted and used.
- **Pin label width always ~53px**: We only cleared `maxWidth` and never set `width`; the label lives inside the pin div, so with `width: auto` it was limited by the pin’s pixel width. When Chars per line &gt; 0 we now set the label element’s width in `ch` units (e.g. `100ch`) so the label has an explicit character-based width and wraps correctly.
- **Source newlines overriding character wrap**: Pin text that already contained newlines (e.g. from a note) was shown as multiple lines regardless of Chars per line. When applying character wrap we now normalize whitespace (e.g. `replace(/\s+/g, ' ')`) so only our character-count / word-boundary logic (and the `ch` width) control line breaks.
- **Context menu flyout disappearing**: The submenu (e.g. Animate on pin context menu) could close as soon as the mouse left the parent item when moving into the flyout, because crossing the gap fired `mouseleave` with `relatedTarget` null. Flyout close is now delayed 200ms and cancelled if the pointer enters the submenu or the parent item, so the flyout stays open when moving into it.

## [13.2.4]

### Changed
- **Chat card legacy themes**: Removed support for `cardsred`, `cardsgreen`, and `cardsblue`. Only `cardsdark` remains for legacy chat cards. All related CSS was removed from legacy card styles.
- **Legacy card CSS merge**: Merged `cards-themes-legacy.css` into `cards-layout-legacy.css` (layout + theme for cardsdark in one file). Removed `cards-themes-legacy.css` and its import from `default.css`.
- **Legacy card CSS shorthand**: Padding and margin in `cards-layout-legacy.css` converted to single-line shorthand (e.g. `padding: 5px 10px`); `border-radius` values simplified where applicable.
- **Common card layout – namespaced typography**: In `cards-common-layout.css`, typography rules (hr, h1–h3, ol, ul, li, p, table, pre) and markdown overrides are now scoped under `.blacksmith-card` instead of `#cards-wrapper-cardsdark`. Markdown class names simplified from `coffee-pub-bibliosoph-markdown-*` to `markdown-*` (e.g. `markdown-div`, `markdown-h1`, `markdown-p`, `markdown-blockquote`, `markdown-ul`, `markdown-ol`, `markdown-hr`).
- **markdownToHtml() output**: `api-core.js` `markdownToHtml()` now emits the new markdown class names (`markdown-hr`, `markdown-h1`–`markdown-h3`, `markdown-ul`, `markdown-ol`, `markdown-li`, `markdown-p`, `markdown-blockquote`, `markdown-div`). Legacy `cards-legacy.css` markdown overrides updated to use `.markdown-*` selectors.
- **User/token card layout – namespaced**: User and token block styles in `cards-common-layout.css` moved to `.blacksmith-card` with simplified class names: `container-user` (was `#cards-user-cardsdark`), `token-image`, `token-text-wrapper`, `token-name`, `token-character`. Legacy `#cards-*` rules remain in `cards-legacy.css` for existing chat messages. `window-common.css` now includes `.blacksmith-card .container-user.bibliosoph-option-div-selected` (and img) for the new namespaced cards alongside existing `#cards-user-cardsdark` selected-state rules.

## [13.2.3] 

### Added
- **Broadcast Combatant Mode**: Added a new broadcast view mode that frames all visible combatant tokens (from the combat tracker) on the current scene, mirroring Spectator behavior but using combatants instead of party tokens.
- **Icon Color Pin Setting**: Added `style.iconColor` to pin data (default: `'#ffffff'`). Configure Pin window now includes an "Icon Color" field (text + color picker) alongside Background and Border. Applies to Font Awesome icons only; image URLs are not tinted. Schema (`pins-schema.js`), config window, renderer, and API documentation (`api-pins.md`) updated with examples and default-design support.
- **Context Menu Stylesheet**: Pin context menu styles moved from inline JS to `styles/menu-context-global.css`. Menu container, separator, and item (including hover) styling are now in CSS for easier theming; `left`/`top` remain in JS for positioning.
- **Context Menu Zones**: Pin right-click menu split into three zone divs—`context-menu-zone-module`, `context-menu-zone-core`, `context-menu-zone-gm`—so each can be styled independently. Module zone holds registered items, core holds built-in actions, GM zone holds GM-only bulk-delete options. Separators are rendered between zones when the next zone has items.

### Changed
- **Asset Updates**: Updated portrait images
- **Core Menu Order**: Pin context menu core items reordered to: Ping Pin, Bring Players Here, Configure Pin, Delete Pin.
- **Context Menu Icons**: Ping Pin uses `fa-signal-stream`; Bring Players Here uses `fa-location-crosshairs`. All delete actions (Delete Pin, Delete All of Type, Delete All Pins) use the same trash icon (`fa-trash`).
- **Menubar API – Optional Title**: `registerMenubarTool()` no longer requires `title`. If omitted, it defaults to the tool's `name`. Validation now checks for `undefined` only (allows `null`, empty strings, and functions). Enables external modules to register left-zone buttons without a title. Documentation (`api-menubar.md`) and JSDoc updated accordingly.
- **Pins API Documentation – Unplaced as Primary**: API documentation (`documentation/api-pins.md`) updated to treat unplaced pins as the normal, primary use case. Added "Unplaced Pins" section; documented `place()`, `unplace()`, `list({ unplacedOnly: true })`, and hooks `blacksmith.pins.created`, `blacksmith.pins.placed`, `blacksmith.pins.unplaced`. PinData and method docs now clarify optional `x`/`y`/`sceneId` and lookup order (unplaced first, then scenes). Examples and status line updated accordingly.

### Fixed
- **Broadcast Pan/Zoom DPR Mismatch**: Normalized broadcast viewport sizing to CSS pixels (instead of renderer pixels) so Mac/HiDPI and Windows compute identical pan/zoom and map-view framing.
- **Player Pin Update – World Setting Permission**: Fixed "User lacks permission to update Setting" when a **non-GM** with edit permission called `pins.update()` for an **unplaced** pin (e.g. note save without "Use as Default"). Unplaced pins are stored in the **world** setting `pinsUnplaced`; only GMs can write world settings. Non-GM unplaced-pin updates now go through `requestGM('updateUnplaced', { pinId, patch, options })` so the GM client performs the write. No world or scene setting write is attempted on the player client. API docs and JSDoc updated; `_setUnplacedPins` is documented as GM-only.
- **Player Pin Place / Unplace – Same Setting Permission**: Fixed the same "lacks permission to update Setting" when a **non-GM** called `pins.place(pinId, { sceneId, x, y })` (e.g. clicking the map to place a note pin) or `pins.unplace(pinId)`. Both operations write the world setting (remove/add from unplaced) and scene flags. Non-GM callers now use `requestGM('place', { pinId, placement })` and `requestGM('unplace', { pinId })` so the GM client performs the writes; the player's canvas is updated with the result (pin appears or is removed).
- **Player Pin Delete (Scene/Setting Permission)**: Fixed "User lacks permission to update Scene" when a **non-GM** with edit permission used the "Delete Pin" context menu (placed or unplaced). Delete writes scene flags (placed) or the world setting (unplaced); only GMs can write. Non-GM deletes now go through `requestGM('delete', { sceneId, pinId, options })` so the GM client performs the write; the player's canvas removes the pin locally after success. A GM must be online for player deletes to succeed.
- **Player Pin Config Save (Scene Permission)**: Fixed "User lacks permission to update Scene" when a player with edit permission tried to save from Configure Pin on a **placed** pin. Scene flags require Scene update permission (GM only). Placed-pin updates by non-GM users now go through `requestGM('update', …)` so the GM client performs the write; the updated pin is returned and the player's canvas is refreshed immediately. A GM must be online for player saves to succeed.
- **Ping Pin Context Menu – Broadcast**: The "Ping Pin" context menu item now passes `broadcast: true` to `pins.ping()`, so all connected players who can view the pin see the animation (previously only the clicking player saw it). "Bring Players Here" already broadcast; Ping Pin now matches that behavior.
- **Broadcast Ping Socket Handler**: Fixed "PinDOMElement.ping is not a function" when a client received a broadcast ping via the `pingPin` socket handler. The handler was calling `PinDOMElement.ping()`; the public `ping()` method lives on `PinRenderer`. The handler now calls `PinRenderer.ping()` so the animation and sound run correctly on receiving clients.
- **Icon Color Not Updating on Canvas**: Fixed icon color change not appearing on the pin until re-opening Configure Pin. CSS rule `.blacksmith-pin-icon[data-icon-type="fa"] i { color: #ffffff }` overrode the wrapper's color. The renderer now sets `style.color` on the inner `<i>` as well as the wrapper so the chosen icon color applies immediately.
- **GM Proxy Socket Handler**: Fixed "No socket handler with the name 'blacksmith-pins-gm-proxy' has been registered" when a non-GM called `pins.requestGM()`. The handler was only registered on the calling client; SocketLib's `executeAsGM` runs the handler on the GM client. The pins GM-proxy handler is now registered on all clients when the socket is ready (`Hooks.once('blacksmith.socketReady')` in `manager-pins.js`), so the GM has the handler before any request.
- **Configure Pin Window for Unplaced Pins**: Fixed "Pin not found" when opening the Configure Pin window for an unplaced pin. `PinConfigWindow` no longer defaults `sceneId` to the active scene when not provided; `getData()` calls `PinManager.get()` without `sceneId` when appropriate, so the unplaced store is checked first, then all scenes. `pins.configure(pinId)` now works for unplaced pins (the primary use case).
- **Monster Mapping / Targeted Indicator Setting Conflict**: Fixed a bug where token image replacement stored monster mapping data in the same setting key (`targetedIndicatorEnabled`) used by the targeting indicator toggle. The targeting feature expects a Boolean; monster mapping stored a large Object, which could break the targeting check. Monster mapping now uses a dedicated setting key `tokenImageReplacementMonsterMapping`. The loader was renamed from `_loadtargetedIndicatorEnabled()` to `_loadMonsterMappingData()`. Migration logic moves existing monster mapping data from the old key to the new key on first load. `_loadMonsterMapping()` reads from the new key with fallback to the old key for compatibility.

## [13.2.2] - Pin Configuration Migration

### Added
- **Broadcast Combatant Mode**: Added a new broadcast view mode that frames all visible combatant tokens (from the combat tracker) on the current scene, mirroring Spectator behavior but using combatants instead of party tokens.
- **Icon Color Pin Setting**: Added `style.iconColor` to pin data (default: `'#ffffff'`). Configure Pin window now includes an "Icon Color" field (text + color picker) alongside Background and Border. Applies to Font Awesome icons only; image URLs are not tinted. Schema (`pins-schema.js`), config window, renderer, and API documentation (`api-pins.md`) updated with examples and default-design support.
- **Context Menu Stylesheet**: Pin context menu styles moved from inline JS to `styles/menu-context-global.css`. Menu container, separator, and item (including hover) styling are now in CSS for easier theming; `left`/`top` remain in JS for positioning.
- **Context Menu Zones**: Pin right-click menu split into three zone divs—`context-menu-zone-module`, `context-menu-zone-core`, `context-menu-zone-gm`—so each can be styled independently. Module zone holds registered items, core holds built-in actions, GM zone holds GM-only bulk-delete options. Separators are rendered between zones when the next zone has items.

### Changed
- **Asset Updates**: Updated portrait images
- **Core Menu Order**: Pin context menu core items reordered to: Ping Pin, Bring Players Here, Configure Pin, Delete Pin.
- **Context Menu Icons**: Ping Pin uses `fa-signal-stream`; Bring Players Here uses `fa-location-crosshairs`. All delete actions (Delete Pin, Delete All of Type, Delete All Pins) use the same trash icon (`fa-trash`).
- **Menubar API – Optional Title**: `registerMenubarTool()` no longer requires `title`. If omitted, it defaults to the tool's `name`. Validation now checks for `undefined` only (allows `null`, empty strings, and functions). Enables external modules to register left-zone buttons without a title. Documentation (`api-menubar.md`) and JSDoc updated accordingly.
- **Pins API Documentation – Unplaced as Primary**: API documentation (`documentation/api-pins.md`) updated to treat unplaced pins as the normal, primary use case. Added "Unplaced Pins" section; documented `place()`, `unplace()`, `list({ unplacedOnly: true })`, and hooks `blacksmith.pins.created`, `blacksmith.pins.placed`, `blacksmith.pins.unplaced`. PinData and method docs now clarify optional `x`/`y`/`sceneId` and lookup order (unplaced first, then scenes). Examples and status line updated accordingly.

### Fixed
- **Broadcast Pan/Zoom DPR Mismatch**: Normalized broadcast viewport sizing to CSS pixels (instead of renderer pixels) so Mac/HiDPI and Windows compute identical pan/zoom and map-view framing.
- **Player Pin Update – World Setting Permission**: Fixed "User lacks permission to update Setting" when a **non-GM** with edit permission called `pins.update()` for an **unplaced** pin (e.g. note save without "Use as Default"). Unplaced pins are stored in the **world** setting `pinsUnplaced`; only GMs can write world settings. Non-GM unplaced-pin updates now go through `requestGM('updateUnplaced', { pinId, patch, options })` so the GM client performs the write. No world or scene setting write is attempted on the player client. API docs and JSDoc updated; `_setUnplacedPins` is documented as GM-only.
- **Player Pin Place / Unplace – Same Setting Permission**: Fixed the same "lacks permission to update Setting" when a **non-GM** called `pins.place(pinId, { sceneId, x, y })` (e.g. clicking the map to place a note pin) or `pins.unplace(pinId)`. Both operations write the world setting (remove/add from unplaced) and scene flags. Non-GM callers now use `requestGM('place', { pinId, placement })` and `requestGM('unplace', { pinId })` so the GM client performs the writes; the player's canvas is updated with the result (pin appears or is removed).
- **Player Pin Config Save (Scene Permission)**: Fixed "User lacks permission to update Scene" when a player with edit permission tried to save from Configure Pin on a **placed** pin. Scene flags require Scene update permission (GM only). Placed-pin updates by non-GM users now go through `requestGM('update', …)` so the GM client performs the write; the updated pin is returned and the player's canvas is refreshed immediately. A GM must be online for player saves to succeed.
- **Icon Color Not Updating on Canvas**: Fixed icon color change not appearing on the pin until re-opening Configure Pin. CSS rule `.blacksmith-pin-icon[data-icon-type="fa"] i { color: #ffffff }` overrode the wrapper's color. The renderer now sets `style.color` on the inner `<i>` as well as the wrapper so the chosen icon color applies immediately.
- **GM Proxy Socket Handler**: Fixed "No socket handler with the name 'blacksmith-pins-gm-proxy' has been registered" when a non-GM called `pins.requestGM()`. The handler was only registered on the calling client; SocketLib's `executeAsGM` runs the handler on the GM client. The pins GM-proxy handler is now registered on all clients when the socket is ready (`Hooks.once('blacksmith.socketReady')` in `manager-pins.js`), so the GM has the handler before any request.
- **Configure Pin Window for Unplaced Pins**: Fixed "Pin not found" when opening the Configure Pin window for an unplaced pin. `PinConfigWindow` no longer defaults `sceneId` to the active scene when not provided; `getData()` calls `PinManager.get()` without `sceneId` when appropriate, so the unplaced store is checked first, then all scenes. `pins.configure(pinId)` now works for unplaced pins (the primary use case).
- **Monster Mapping / Targeted Indicator Setting Conflict**: Fixed a bug where token image replacement stored monster mapping data in the same setting key (`targetedIndicatorEnabled`) used by the targeting indicator toggle. The targeting feature expects a Boolean; monster mapping stored a large Object, which could break the targeting check. Monster mapping now uses a dedicated setting key `tokenImageReplacementMonsterMapping`. The loader was renamed from `_loadtargetedIndicatorEnabled()` to `_loadMonsterMappingData()`. Migration logic moves existing monster mapping data from the old key to the new key on first load. `_loadMonsterMapping()` reads from the new key with fallback to the old key for compatibility.


## [13.2.1] - Pin System Enhancements

### Added
- **Drop Shadow Property**: Added `dropShadow` property to pin data (default: `true`). Adds a subtle drop shadow to pins for better visual depth and separation from the canvas background. Shadow styling is controlled via CSS variable `--blacksmith-pin-drop-shadow` for easy customization (default: `drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))`).
- **Enhanced API Documentation**: Added comprehensive shape examples to API documentation showing all three pin shapes (`'circle'`, `'square'`, `'none'`) with code examples demonstrating usage for each shape type.
- **Pin Animation Broadcasting**: Implemented `broadcast` parameter for `pins.ping()` method. When `broadcast: true`, animations are shown to all connected users who have permission to view the pin. Uses Blacksmith socket system with automatic permission filtering.
- **Bring Players Here**: Added "Bring Players Here" to pin context menu. Pans all connected players to the pin and plays ping animation. Available to all users (for now). Uses `broadcast` option on `pins.panTo()` method.
- **`pins.exists()` Helper**: Added `pins.exists(pinId, options?)` method to check if a pin already exists on a scene before attempting creation. Helps modules avoid duplicate ID errors by checking first.
- **`pins.refreshPin()` Method**: Added `pins.refreshPin(pinId, options?)` method to force a single pin to rebuild its icon element. Useful for edge cases where `update()` doesn't fully refresh the visual. Note: This should rarely be needed as `update()` now automatically handles icon/image type changes.

### Changed
- **Pan/Zoom Performance**: Removed pan/zoom hide/show logic. Pins now remain visible during canvas pan and zoom operations. Pure DOM rendering handles position updates smoothly without needing to hide pins, providing better UX and simpler code.
- **Pin Animation System**: Added `pins.ping(pinId, options)` method to animate pins and draw attention. Supports 11 animation types including new `'ping'` combo animation (scale-large with sound + ripple - recommended for navigation), plus pulse, ripple, flash, glow, bounce, scale-small/medium/large, rotate, and shake. Configurable loops, optional sound effects, and broadcast support. Animations use CSS keyframes for smooth performance.
- **Context Menu Reorganization**: Restructured pin right-click menu with separator between module-registered commands and built-in commands. Built-in commands now appear in order: "Bring Players Here", "Ping Pin", "Delete Pin". Removed test animation menu items (Bounce, Pulse, Ripple, Flash, Glow, Scale Small/Medium/Large, Rotate, Shake) from production menu.
- **Pin Pan-to-Location API**: Added `pins.panTo(pinId)` method to pan the canvas to a pin's location. Supports optional `ping` parameter to automatically animate the pin after panning. Useful for navigating to pins from other UI elements (e.g., clicking a note in a journal to pan to its associated pin).
- **Context Menu Ping**: Added "Ping Pin" option to right-click context menu (available to all users) with combo animation (scale-large followed by ripple).
- **Cross-Scene Pin Deletion**: `pins.delete(pinId)` now automatically searches all scenes to find the pin if no `sceneId` is provided. This makes it easy to delete pins from notes/UI without tracking which scene they're on.
- **Find Pin Scene Helper**: Added `pins.findScene(pinId)` method to find which scene contains a specific pin.
- **Pure DOM Pin Rendering**: Refactored pin rendering from hybrid PIXI+HTML approach to pure DOM approach for better layering, styling flexibility, and performance. Pins now render as HTML divs in a fixed overlay container (`#blacksmith-pins-overlay`) with `z-index: 2000`.
- **Pin Shape Support**: Added `shape` property to pin data with support for `'circle'` (default), `'square'` (rounded corners), and `'none'` (icon only, no background). Square pins use configurable border radius via CSS variable.
- **Double-Click Event**: Added `'doubleClick'` event type to pin event system. Double-click detection uses a 300ms window and prevents false clicks/double-clicks during drag operations.
- **Context Menu Registration System**: Added `pins.registerContextMenuItem()` and `pins.unregisterContextMenuItem()` API methods allowing modules to register custom context menu items. Menu items can be filtered by `moduleId` and `visible` function, and sorted by `order` property. Default items (Delete Pin, Properties) are always included.
- **RGBA Color Support**: Pin style properties (`fill`, `stroke`) now support RGBA, HSL, HSLA, and named colors in addition to hex colors. Alpha channel is properly handled.
- **Enhanced Image Support**: Pin `image` property now supports multiple formats:
  - Font Awesome HTML: `<i class="fa-solid fa-star"></i>`
  - Font Awesome class strings: `'fa-solid fa-star'`
  - Image URLs: `'icons/svg/star.svg'` or `'assets/images/portrait.webp'`
  - Image tags: `<img src="path/to/image.webp">`
- **CSS-Based Styling**: All pin styles moved to `styles/pins.css` with CSS variables for configuration:
  - `--blacksmith-pin-icon-size-ratio`: Controls image size within pin (default: 0.90 = 90%)
  - `--blacksmith-pin-square-border-radius`: Controls corner radius for square pins (default: 15%)
- **Fade-In Animations**: Pins now fade in smoothly (0.2s transition) when created or shown after scene load.
- **Performance Optimizations**: Pins hide during canvas pan/zoom operations and update positions after a debounced delay (200ms) to allow canvas to settle, eliminating lag during canvas interactions.

### Changed
- **Pin Rendering Architecture**: Complete refactor from hybrid PIXI+HTML to pure DOM approach. Pins are now HTML divs with CSS styling instead of PIXI.Graphics objects. This improves layering (pins appear above tokens), simplifies styling, and provides better browser compatibility.
- **Event System**: Switched from PIXI event system to DOM event system. All events now use DOM MouseEvent instead of PIXI.FederatedPointerEvent. Event listeners are attached directly to pin DOM elements.
- **Context Menu**: Enhanced context menu system with registration API. Modules can now add custom menu items that appear alongside default items. Menu items are filtered and sorted automatically.
- **Pin Visibility**: Pins now properly load and display on scene activation. Added `_scheduleSceneLoad()` method to ensure pins are loaded after canvas is fully initialized.

### Fixed
- **Ownership Visibility**: Fixed pins to only render for users with view permissions. Pins now respect the `ownership` property and automatically filter based on user permissions during scene load and updates.
- **Ownership Permission Bug**: Fixed `_canView()` to require at least LIMITED (level 1) permission instead of incorrectly allowing NONE (level 0).
- **Pin Positioning**: Fixed icon centering issues by dynamically measuring Font Awesome icon dimensions after rendering instead of assuming square dimensions.
- **Scene Load**: Fixed pins not appearing on scene load until a new pin was added. Pins now load automatically when scenes activate.
- **Pan/Zoom Performance**: Fixed lag during canvas pan/zoom by hiding pins instantly and showing them after canvas settles, with debounced position updates.
- **Visual Glitches**: Fixed pins appearing off-center then snapping into place by ensuring positions are calculated before pins become visible.
- **Image Rendering**: Images now render nicely within pin shapes using `background-size: cover` and circular clipping for proper fill without gaps.
- **Drag Position Persistence**: Fixed pins snapping back to original position after drag by tracking and saving the final dragged position instead of using stale pin data.
- **Subsequent Drag Operations**: Fixed pins jumping away from mouse cursor on second and subsequent drags by fetching fresh pin data at the start of each drag operation instead of using stale closure data.
- **Double-Click Detection**: Fixed double-click events not firing for editable pins by removing a faulty condition that prevented the second click from being registered when a timeout from the first click was still active.
- **Memory Leaks**: Fixed critical memory leaks in pin system:
  - Hook listeners (`canvasPan`, `updateScene`, `canvasReady`) now properly removed on module cleanup
  - Window resize listener now properly removed on module cleanup
  - Pending animation frames now canceled on cleanup
- **Performance Optimizations**: Eliminated PIXI.Point allocations in hot paths by reusing single point instances for coordinate conversion. Pan/zoom operations and drag operations now use zero allocations for coordinate math, reducing garbage collection pressure.
- **"Bring Players Here" Socket Issue**: Fixed "Bring Players Here" context menu option not working. Changed from `socket.emit()` (which routes through generic event system) to `socket.executeForOthers()` (which directly calls SocketLib handlers). Now properly broadcasts pan-to-pin and ping animation to all connected players.
- **Icon/Image Type Change Rendering**: Fixed pins not updating visually when switching between icon and image types (e.g., from Font Awesome icon to `<img>` tag or vice versa). The renderer now automatically detects icon/image type changes during `update()` and rebuilds the icon element when needed, eliminating the need for manual `reload()` calls. Pins now update immediately when changing icon/image types without requiring a page refresh.

### Technical Details
- **Coordinate Conversion**: Pins use `PIXI.Point` and `stage.toGlobal()` for converting scene coordinates to screen pixels, accounting for canvas scale and position. Reuses single point instances to avoid allocations.
- **CSS Variables**: All configurable styling moved to CSS variables in `:root` selector at top of `pins.css` for easy customization.
- **DOM Reflow**: Uses `void element.offsetWidth` to force browser reflow when needed for accurate positioning.
- **Event Cleanup**: All event listeners use AbortController pattern for automatic cleanup on pin removal or module unload. Hook listeners and window listeners properly cleaned up in `cleanup()` method.
- **Socket Integration**: Pin broadcasting uses SocketLib's `executeForOthers()` method directly to match handler registration pattern, ensuring reliable cross-client communication.
- **Icon Type Tracking**: Pin renderer tracks icon type (`'fa'`, `'image'`, or `'none'`) using `dataset.iconType` on the icon element. When `update()` detects a type change, it removes the old icon element and creates a new one to ensure clean state and prevent stale rendering. All icon-related styles are cleared before applying new styles to avoid visual artifacts. 

## [13.2.0] - Pin API Draft Release

### NEW FEATURE
- **Canvas Pins System**: Complete pin system for placing configurable markers on the FoundryVTT canvas. Pins are stored in scene flags, support Font Awesome icons, and provide full CRUD operations with event handling. Designed for use by other Coffee Pub modules (e.g., Coffee Pub Squire).

### Added
- **Pin API Availability Checks**: Added `pins.isAvailable()`, `pins.isReady()`, and `pins.whenReady()` methods to help other modules safely use the pins API. `isAvailable()` checks if Blacksmith is loaded and the API is exposed. `isReady()` checks if the API is available, canvas is ready, and a scene is active. `whenReady()` returns a Promise that resolves when the canvas is ready (useful for modules that need to create pins at `init` or `ready`).
- **Pin API Usage Documentation**: Expanded `api-pins.md` with comprehensive usage patterns, including cross-module integration examples, event handler patterns with `AbortSignal` cleanup, and step-by-step guides for creating pins from other modules. Added examples for `init`/`canvasReady` hooks, handler registration with cleanup, and sync guards before reload operations.
- **Markdown Utilities (Subset)**: Added `markdownToHtml()` and `htmlToMarkdown()` to core utilities for the supported Markdown subset (headings, rules, emphasis, lists, blockquotes) with safe HTML sanitization and a wrapper class for styling.
- **Markdown Utility Documentation**: Documented the supported subset with examples in `documentation/api-core.md`.


## [13.1.1]

### Added
- **Pin Data Model**: UUID-based pin IDs, schema versioning, validation, and migration system. Pins stored in `scene.flags['coffee-pub-blacksmith'].pins[]`.
- **Pin CRUD API**: Full create, read, update, delete, and list operations via `game.modules.get('coffee-pub-blacksmith')?.api?.pins`.
- **Event Handler System**: Register handlers for `hoverIn`, `hoverOut`, `click`, `rightClick`, `middleClick` events with filtering by `pinId`, `moduleId`, `sceneId`. Supports `AbortSignal` for automatic cleanup.
- **Pin Rendering**: Pins render on Blacksmith layer as circles with Font Awesome icons. Hover feedback (scale animation) and visual styling (fill, stroke, size, alpha).
- **Context Menu**: Right-click context menu with Edit, Delete, and Properties options. Permission-aware (respects ownership and `pinsAllowPlayerWrites` setting).
- **Font Awesome Icon Support**: Pins use Font Awesome icons only (e.g., `<i class="fa-solid fa-star"></i>`). Legacy image paths automatically converted to default star icon.
- **Auto-Layer Activation**: Blacksmith layer automatically activates when loading scenes with pins, ensuring pins are visible after refresh.
- **Pin Reload API**: `pinsAPI.reload()` method for manual pin reload from console (useful for debugging).
- **Permission System**: GM-only create/update/delete by default, configurable via `pinsAllowPlayerWrites` world setting. Ownership-based visibility/editability using Foundry's ownership levels.
- **Scene Persistence**: Pins automatically load when scenes activate and persist across scene changes.

### Changed
- **Blacksmith Layer Auto-Activation**: Layer now automatically activates when loading scenes that contain pins, ensuring pins are visible without manual layer activation.

### Fixed
- **Player Toolbar Refresh**: Removed GM-only render guard so player clients refresh toolbars when external modules register tools.
- **Toolbar Hook Error**: Fixed undefined `toolsFromVisibleTools` reference during toolbar rebuild.
- **Icon Loading Errors**: Pins now use Font Awesome only, eliminating 404 errors from legacy SVG image paths. Legacy paths automatically converted to Font Awesome star icon.

### Removed
- **Legacy Broadcast Auto-Close Settings**: Removed deprecated legacy broadcast auto-close settings (`broadcastAutoCloseImages`, `broadcastImageCloseDelaySeconds`, `broadcastAutoCloseJournals`, `broadcastJournalCloseDelaySeconds`) and their migration logic. These have been replaced by `broadcastAutoCloseWindows` and `broadcastAutoCloseDelaySeconds`.

## [13.1.0]

### NEW FEATURE
- **Broadcast Mode**: Added broadcast mode for shared-screen, streaming, and recording FoundryVTT sessions.

### Added
- **Broadcast Window Tools**: Added broadcast tools for closing images, closing journals, closing all windows, refreshing the cameraman client, and opening settings on the cameraman.
- **Broadcast Auto-Close**: Added `broadcastAutoCloseWindows` and `broadcastAutoCloseDelaySeconds` to auto-close cameraman windows after share.
- **Combat Target Framing**: Combat mode now includes targeted tokens in the framing box and updates view when targets change.
- **Broadcast Notification Hiding**: Added `broadcastHideNotifications` setting to hide Foundry pop-up notifications (in `#notifications` container) when in broadcast mode.

### Changed
- **Broadcast View Fill**: Follow, combat, and spectator now use viewport fill percent instead of padding; settings renamed to view fill and legacy padding migration removed.
- **Combat Mode Alignment**: Combat mode now mirrors follow behavior (fixed 3x3 minimum box, turn-start pan, movement follow) with its own view fill.
- **Broadcast Auto-Close Flow**: Cameraman emits `broadcast.windowOpened`; GM starts the auto-close timer and sends close commands.
- **Timer Notification System Simplified**: Removed warning threshold from combat timers - now only uses critical threshold for consistency with planning timers. Unified timer pause/unpause notification settings to control both planning and combat timers.
- **Timer Critical Message Setting**: Renamed `timerChatTurnRunningOut` to `combatTimerCriticalEnabled` for clarity. This setting now controls both notification popups and chat messages for critical threshold warnings in combat timers.
- **Timer Notification Labels**: Updated planning timer labels to use "Critical" terminology instead of "Ending Soon" for consistency.
- **Loading Indicator Stream View Detection**: Loading progress indicator now automatically detects Stream View mode and does not display when Stream View is active (checks for `stream` or `no-ui` classes on document.body).

### Fixed
- **Menubar Enable Setting**: Fixed `enableMenubar` setting not controlling menubar visibility. Menubar now properly initializes only when enabled, removes DOM and resets CSS height variables when disabled, preventing content from being pushed down. Both `excludedUsersMenubar` and `enableMenubar` settings now work correctly together.
- **Broadcast Follow Buttons on Scene Change**: Follow buttons now refresh when scenes change so the list matches current canvas tokens.
- **Duplicate Timer Notifications**: Fixed timer notifications (sounds, chat messages, and notifications) being sent multiple times when crossing threshold. Added flags to ensure each notification type is sent only once per threshold crossing.
- **Duplicate Turn Start Messages**: Fixed duplicate "Turn Started" messages appearing when combat timer resets. Removed duplicate message sending from `resetTimer()` method.
- **Timer Pause/Resume Messages**: Fixed pause and resume messages appearing during automatic timer state changes (e.g., entering planning phase, turn changes). Messages now only appear when GM manually clicks pause/resume buttons.
- **Timer Start Before Initiative Rolled**: Fixed combat turn timers starting and sending messages before all combatants have rolled initiative. Timer now checks that all combatants have rolled initiative before starting, matching planning timer behavior.
- **Combat Timer During Planning Phase**: Fixed combat turn timer starting during planning phase. Timer now correctly checks if planning phase is active (turn 0) and prevents combat timer from starting until planning phase ends.
- **Critical Message Not Showing**: Fixed `combatTimerCriticalEnabled` setting not showing critical messages. Setting now properly controls both notification popups and chat messages regardless of general notification settings.

## [13.0.12]

### Added
- **MVP Tuning Settings (Round + Combat MVP)**:
  - New GM-configurable sliders for MVP scoring weights: Hits, Misses, Crits, Fumbles, Damage (per 10), Healing (per 10)
  - New checkbox to **Normalize MVP scoring by party max** (default: enabled) to reduce "big number" bias and make weights more comparable across party levels/roles
- **Player Manual Rolls Control**: Added `sidebarManualRollsPlayersEnabled` world setting (GM-only) to control whether players can see the manual rolls toggle button in the sidebar. Players must have both `sidebarManualRollsEnabled` (user) and `sidebarManualRollsPlayersEnabled` (world) enabled to see the button.

### Changed
- **MVP Scoring Formula**: MVP scoring is now driven by the new settings (including optional normalization) and is applied consistently for both Round MVP and Combat MVP.
- **Manual Rolls Toggle**: Converted manual rolls toggle to pure client-only operation. Players now toggle their own `core.diceConfiguration` setting directly without requiring socket communication to the GM. GM receives a whisper notification when players toggle manual rolls.
- **Settings Scope Migration**: Migrated 28 user preference settings from `scope: "client"` to `scope: "user"` to ensure user preferences persist across devices. Settings now follow users when they log in from different browsers or devices within the same world. This includes UI preferences (sidebar, toolbar, titlebar, canvas tools, combat tracker display), behavior preferences (auto-roll initiative, clear targets, manual rolls), audio preferences (timer sound volume), and developer preferences (debug mode, console style). Window state settings (combat tracker size, token image replacement window state, chat+combat split) remain `scope: "client"` as they are device-specific.
- **registerHeader Function**: Enhanced `registerHeader` helper function to accept optional `scope` parameter (defaults to `"world"`). All `registerHeader` calls now explicitly specify scope, with user preference sections using `"user"` scope and world-wide configuration sections using `"world"` scope.
- **Hide Default Target Indicators**: Changed `hideDefaultTargetIndicators` setting from `scope: "user"` to `scope: "world"` with default value changed from `false` to `true`. This ensures consistent target indicator behavior across all users in the world.
- **Round Summary Accuracy Display**: Changed accuracy detail in round summary cards to show "X of Y" format (e.g., "3 of 7") instead of "X hits Y misses" for better readability. Misses information remains available in the tooltip.

### Fixed
- **Manual Rolls Toggle for Players**: Fixed critical issue where players could not toggle manual rolls via the sidebar button. The toggle now works immediately for players without requiring them to open Foundry's Dice Configuration settings first. The system now automatically initializes dice configuration with proper dice keys when empty, ensuring toggles work on first use.
- **Manual Rolls Button State**: Fixed button color/active state not updating for players after toggling. Button now correctly reflects the current manual rolls state by re-reading the dice configuration after applying changes.
- **Latency Socket Errors**: Fixed "Unknown message type" errors appearing in player client consoles for latency checker ping/pong messages. Socket handlers now correctly extract payload from nested SocketLib message structures, and the latency checker silently ignores ping/pong messages not intended for the current user (since `executeForOthers` broadcasts to all clients but only the target should process them).

## [13.0.11]

### Added
- **Loading Progress Indicator**: Comprehensive loading progress system for FoundryVTT world loading
  - Full-screen overlay showing overall FoundryVTT loading progress (not just module initialization)
  - Tracks 5 major loading phases: Modules → Systems → Game Data → Canvas → Finalizing
  - Live activity feed displaying current loading activity with spinning icon
  - Activity history showing recent loading activities with fade-out effect
  - Progress bar with percentage display and smooth animations
  - Close button (X) to dismiss indicator and let FoundryVTT continue loading normally
  - Respects `coreLoadingProgress` setting to enable/disable the indicator
  - Background image matching module window style (background-skull-red.webp)
  - Red color scheme matching module theme for progress bar and accents
  - Font Awesome spinner icon for activity indicator
  - Automatic detection of FoundryVTT loading phases via polling
  - Manual activity logging during Blacksmith initialization steps
  - Safe setting check with fallback (defaults to showing if setting unavailable during early init)
- **Chat + Combat Sidebar Tab**: New hybrid sidebar tab combining chat log and combat tracker
  - New tab button appears after the existing Combat button in the sidebar
  - Chat log displayed at top (read-only, no input or controls)
  - Combat tracker displayed at bottom
  - Draggable divider between panes for custom sizing (default 50/50 split)
  - Split ratio persisted per user via client setting (`chatCombatSplit`)
  - Respects `sidebarCombatChatEnabled` setting to show/hide the tab
  - Chat log auto-scrolls to latest messages when content is added
  - Preserves core chat tab functionality by cloning chat log instead of moving it
  - Maintains Foundry's native combat tracker styling by moving entire combat section
- **Healing Tracking System**: Implemented comprehensive healing tracking for player lifetime stats
  - **HP Delta Tracking (Lane 1)**: Source of truth for applied healing - tracks actual HP changes via `preUpdateActor`/`updateActor` hooks
  - **Chat Message Attribution**: Detects healing spells in chat messages using reliable `activity.type === "heal"` signal for caster attribution
  - **MIDI Workflow Support**: Processes healing via `midi-qol.preTargetDamageApplication` hook for accurate per-target healing attribution when using Midi-QOL module
  - **Healing Received**: Tracks `lifetime.healing.received` on target actors when HP increases
  - **Healing Given**: Tracks `lifetime.healing.given` and `lifetime.healing.total` on caster actors
  - **Revive Tracking**: Increments `lifetime.revives.received` when HP goes from 0 to >0
  - **By-Target Tracking**: Maintains `lifetime.healing.byTarget` object with healing amounts per target
  - **Most/Least Healed**: Tracks `mostHealed` and `leastHealed` based on byTarget totals
  - **Human-Readable Logging**: Added detailed console logging for healing data collection (using `postConsoleAndNotification` with "Player Stats | " prefix)
- **Unconscious Tracking System**: Implemented comprehensive unconscious event tracking for player lifetime stats
  - **HP Delta Source of Truth**: Tracks unconscious events when HP drops from >0 to ≤0 via `updateActor` hooks
  - **Queue-Based Attribution**: Stores damage context in per-target queues (last 10 entries) for accurate attribution in multi-hit scenarios
  - **Combat-Aware Matching**: Scores damage contexts by combat round/turn, recency, and damage amount to select best match
  - **Unconscious Log**: Maintains detailed log of unconscious events with date, scene, attacker, weapon, and damage amount
  - **Count Tracking**: Tracks total unconscious count in `lifetime.unconscious.count`
  - **Attribution System**: Captures attacker name, weapon/source name, and damage amount when available from damage messages
- **Refactored Hit/Miss/Damage Tracking**: Complete overhaul of attack and damage resolution system
  - **Message Resolution Pipeline**: New `utility-message-resolution.js` with shared functions for parsing chat messages
  - **Stable Identifiers**: Uses `speaker.actor`, `flags.dnd5e.item.uuid`, `flags.dnd5e.activity.uuid`, and sorted target UUIDs for correlation (replaces unstable `originatingMessage`)
  - **Accurate Hit/Miss Detection**: Determines hit/miss from attack messages using `attackTotal >= target.ac` instead of inferring from damage rolls
  - **Damage Classification**: Classifies damage as "onHit" or "other" based on attack outcome, not damage presence
  - **Attack Cache System**: Implements TTL-based cache (15 seconds) with deduplication for multi-damage workflows
  - **Separate Stats Model**: Records `attacks.hit`, `attacks.miss`, `damage.rolled.onHit`, `damage.rolled.other` separately for accuracy
- **Crit/Fumble Detection Improvements**: Enhanced critical hit and fumble detection
  - **Active Result Detection**: Now uses the active d20 result (for advantage/disadvantage) instead of first result
  - **Multiple d20 Support**: Handles rolls with multiple d20 terms correctly
  - **Debug Logging**: Added diagnostic logging for crit/fumble detection verification
- **Actor Update Queue System**: Implemented per-actor serialization queue to prevent race conditions in stat updates
  - **Sequential Update Guarantee**: Ensures all stat updates for the same actor happen sequentially, not concurrently
  - **Promise-Based Queueing**: Uses promise chaining to serialize writes and prevent concurrent read-modify-write cycles
  - **Automatic Cleanup**: Queue entries are automatically cleaned up when no longer needed
  - **Healing Race Condition Fix**: Prevents healing totals from being overwritten in multi-target healing scenarios (e.g., Mass Cure Wounds)
- **Combat/Round Stats Reliability (Core + Midi-QOL)**: Brought combat/round tracking in line with the multi-lane player-stats architecture
  - **MIDI Lanes**: Use Midi-QOL workflow hooks for authoritative combat events
    - `midi-qol.hitsChecked` for hit/miss resolution
    - `midi-qol.preTargetDamageApplication` for damage + healing (per-target amounts)
    - `midi-qol.RollComplete` for crit/fumble (stamped onto cached attacks)
  - **Core Lane Safety**: Chat-message lane remains as a fallback when Midi-QOL is not authoritative
    - Added `updateChatMessage` handling (rolls/flags-only) so core messages that receive roll data after creation are still processed
  - **Damage/Healing Policy Alignment**:
    - Combat totals now include all damage/healing, including `bucket: "other"` and `"unlinked"` (AoE/save/non-attack and correlation misses)
    - “Top hits / Biggest hit / Weakest hit” moments remain **onHit-only**
  - **Target Attribution Improvements**: Damage processing prefers `damageEvent.targetUuids` when present, with best-effort fallbacks
  - **Combat Summary Totals**: Party-wide totals are computed from **player characters only** (participants may include NPCs for context/moments)

### Changed
- **Healing Detection Logic**: Simplified healing detection to use only reliable `flags.dnd5e.activity.type === "heal"` signal
  - Removed unreliable item name heuristics (checking for "heal", "cure", "restore" in names)
  - Removed `actionType` checks (undefined/unreliable in dnd5e 5.2.4)
  - Per developer review: In dnd5e 5.2.4, healing rolls appear as `roll.type === "damage"` but `activity.type === "heal"` is the reliable indicator
- **API Documentation Console Commands**: Updated all Player Namespace console examples to use `BlacksmithUtils.postConsoleAndNotification` instead of `console.log`
  - All examples now include "Player Stats | " prefix for easy console filtering
  - Consistent with internal codebase logging patterns
  - Properly respects debug flags and notification settings
- **Damage Context Storage**: Upgraded from single-value to queue-based storage for better multi-hit correlation
  - Changed from `Map<actorId, DamageContext>` to `Map<actorId, DamageContext[]>` (queue per target)
  - Stores last 10 damage contexts per target instead of overwriting
  - Includes combat round/turn information for better matching
  - Lazy pruning per target (only removes entries older than 15s for that specific target)
- **Roll Hooks Narrowed**: Roll hooks now only handle crit/fumble detection and metadata
  - `dnd5e.rollAttack`: Only detects crit/fumble, removed hit/miss/damage tracking
  - `dnd5e.rollDamage`: Only forwards to GM for non-GM clients, removed damage tracking
  - All hit/miss/damage resolution moved to `createChatMessage` hook for accuracy
- **Damage Event Hydration**: Enhanced damage event resolution with fallback hydration from chat messages
  - Hydrates missing `attackerActorId` from `message.speaker.actor`
  - Hydrates missing `itemUuid` from `message.flags.dnd5e.item.uuid` (and variants)
  - Hydrates missing `targetUuids` from `message.flags.dnd5e.targets`
  - Provides fallback attacker/item names when resolution fails
  - Ensures context storage always has best available data
- **Sidebar Tab Settings**: Added setting controls for sidebar features
  - `sidebarCombatChatEnabled` setting to enable/disable the Chat + Combat tab
  - `sidebarManualRollsEnabled` setting honored for manual roll button visibility
  - Both settings support dynamic toggling without requiring page reload

### Fixed
- **Healing Message Detection**: Fixed healing messages being incorrectly skipped as "Unlinked Damage"
  - Healing spells now properly detected using `activity.type === "heal"` before skipping unlinked damage
  - Caster's lifetime stats now update when healing spells are cast
  - Target's lifetime stats update via HP delta tracking when healing is applied
- **Healing Stats Not Updating**: Fixed issue where caster's `healing.total` and `healing.given` were not being updated
  - Added `_recordRolledHealing` method to track healing given for casters
  - Healing detection now properly processes healing messages instead of skipping them
- **Inaccurate Hit/Miss Tracking**: Fixed critical bug where all attacks appeared as hits when using midi-qol
  - Root cause: System was inferring "hit = damage rolled", which breaks when midi rolls damage on misses
  - Solution: Now determines hit/miss from attack message (`attackTotal >= target.ac`) before damage is rolled
  - Correctly handles midi-qol "damage on miss" scenarios by classifying as "damage.rolled.other"
- **Unstable Message Correlation**: Fixed damage attribution failures due to unstable `originatingMessage` in dnd5e 5.2.4
  - Replaced `originatingMessage` correlation with stable identifier key (attacker + item + activity + sorted targets)
  - Attack and damage messages now correlate reliably even when `originatingMessage` differs
- **Unconscious Attribution**: Fixed unconscious events showing "Unknown Attacker" and "Unknown Source"
  - Implemented queue-based context storage to handle multiple hits on same target
  - Added combat round/turn matching for better attribution in multi-hit scenarios
  - Increased TTL window from 5s to 15s to account for delays between damage messages and HP updates
  - Enhanced damage event hydration to extract attacker/item/targets from chat message when resolver misses fields
  - Context selection now scores candidates by combat match, recency, and damage amount instead of "last write wins"
- **Crit/Fumble Detection**: Fixed crit/fumble detection failing on advantage/disadvantage rolls
  - Now uses the active d20 result (marked `active: true`) instead of first result
  - Handles multiple d20 terms correctly (e.g., advantage rolls with two d20s)
  - Falls back to first result if no active result is found
- **Healing Race Condition**: Fixed critical race condition where multi-target healing spells (e.g., Mass Cure Wounds) were overwriting healing totals instead of accumulating them
  - Root cause: Multiple concurrent `preTargetDamageApplication` hooks firing simultaneously for the same healer, causing read-modify-write cycles to see stale values
  - Solution: Implemented per-actor update queue system that serializes all stat writes for the same actor
  - Healing totals now correctly accumulate: `0 → 30 → 60 → 90` instead of `0 → 30` (overwritten)
  - Applied to both MIDI healing (`_onMidiPreTargetDamageApplication`) and core healing (`_onChatMessage`) paths
  - Prevents similar race conditions in damage tracking and other concurrent stat updates
- **Combat Summary Totals & Field Mapping**: Fixed combat-end summary totals being incorrect
  - Party totals now aggregate **PCs only** (instead of PCs + NPCs)
  - Corrected mapping so `damageTaken` and `healingGiven` reflect actual tracked values

## [13.0.10]

### Added
- **Combat Start Announcement Card**: Added combat start announcement card that posts when combat is created. Card respects `announceCombatStart` setting and plays `combatStartSound` if configured. Uses dedicated `card-stats-combat-start.hbs` template with green announcement theme.
- **Combat End Announcement Card**: Added "End of Combat" card that appears first in combat summary cards. Card respects `announceCombatEnd` setting and plays `combatEndSound` if configured. Uses dedicated `card-stats-combat-end.hbs` template matching other announcement card styling.
- **Round Start Card**: Renamed `card-stats-round-end.hbs` to `card-stats-round-start.hbs` and updated text to "Round X Begins". Now used for round announcements instead of the section in `cards-common.hbs`.

### Changed
- **Menubar Party Tool Visibility**: Changed party tool visibility to be GM-only instead of leader-only. The tool is now only visible to Game Masters, matching the behavior of other party management tools. This change ensures that non-GM users cannot access party management tools, reinforcing the GM-only nature of these tools.
- **Round and Combat Card Sending**: Updated round and combat stat cards to be sent simultaneously using `Promise.all()` instead of sequentially. This prevents other modules' messages (like movement change or round change cards) from being inserted between stat cards, ensuring all related cards appear together in chat.
- **Round Announcement Template**: Moved round announcement from `cards-common.hbs` to dedicated `card-stats-round-start.hbs` template for better modularity and consistency with other announcement cards.

### Fixed
- **Round Number Calculation**: Fixed round number in round end cards to use the `roundNumber` parameter (the round that just ended) instead of `game.combat.round` (which is already the new round). Round end cards now correctly display the round that just completed.
- **Partial Round Stats on Combat End**: Fixed issue where combat ending mid-round would lose all data from that partial round. The system now detects when combat ends with active round data and processes it like a normal round end (calculates MVP, creates round summary, adds to rounds array) before generating the combat summary. All hits, misses, damage, and other stats from the partial round are now properly captured and included in combat statistics.
- **Combat End Null Reference Error**: Fixed `TypeError: Cannot read properties of null (reading 'turns')` error when combat is deleted. Updated `_onRoundEnd()` and `_prepareTemplateData()` to accept optional combat parameter, allowing them to work with combat objects even when `game.combat` is null during combat deletion. This ensures partial rounds are processed correctly when combat ends mid-round.
- **Token Movement Permission Errors**: Fixed permission errors when players create combat. Added try-catch blocks around setting updates in `createCombat` and `deleteCombat` hooks to gracefully handle permission errors for non-GM clients, preventing error messages from appearing when combat is created or deleted.


## [13.0.9]

### Added
- **Menubar Button Color Customization**: Added `buttonNormalTint` and `buttonSelectedTint` parameters to `registerMenubarTool()` for custom button background colors. Both parameters accept any valid CSS color format (hex, rgba, named colors, HSL, etc.), providing maximum flexibility for tool styling. The normal tint applies to default button state, while the selected tint applies when toggleable tools are active.
- **Menubar Grouping System Documentation**: Added comprehensive documentation for the tiered grouping system, including organization hierarchy (Zone -> Group -> Module -> Order), Blacksmith-defined groups (combat, utility, party, general), group priority rules, and dynamic group creation. Updated all examples to demonstrate best practices with explicit parameter setting.

### Changed
- **Combat Stats Card Structure**: Reverted combat stats cards to simple div-based structure using `<div class="card-header">` and `<div class="section-content">` for consistent styling across all coffee pub cards. Removed Foundry collapsible system integration as it was designed for internal sections, not whole cards.
- **Menubar API Documentation**: Updated API documentation to reflect current implementation with all new parameters (`group`, `groupOrder`, `buttonNormalTint`, `buttonSelectedTint`). Enhanced "Register a Tool" getting started example with complete parameter list following best practices. Updated `getMenubarToolsByZone()` return structure documentation to accurately reflect grouped organization (zone -> group -> module array -> tools). All examples now explicitly show all optional parameters for clarity and maintainability.

### Fixed
- **Menubar Button Tint CSS**: Fixed CSS to properly use custom `--button-normal-tint` and `--button-selected-tint` CSS variables for button background colors. Updated `.blacksmith-menubar-middle .button-active` to use `var(--button-normal-tint, ...)` with fallback to default colors. Updated `.blacksmith-menubar-middle .button-active.tool-active` to use `var(--button-selected-tint, ...)` for active/selected state. Both variables are now properly set in the template's style attribute and applied by CSS with appropriate fallbacks.
- **Menubar Template CSS Variables**: Fixed template to set both `--button-normal-tint` and `--button-selected-tint` as CSS variables in the style attribute instead of data attributes, ensuring they work correctly with CSS fallback values.

### Removed
- **Combat Stats Collapsible Functionality**: Removed all collapsible/expand functionality from combat stats cards. Removed `_registerCollapsibleStateTracking()` method, `sectionStates` static property, and `combatStatsCardStates` client setting. Cards now use the standard non-collapsible card template structure.

### Fixed
- **Auto-Distribute XP Functionality**: Fixed `autoDistributeXp` setting to properly bypass the XP distribution window and automatically distribute XP when enabled. When the setting is enabled, the system now automatically distributes XP based on default values (all players included, no adjustments) without showing the distribution window, effectively mimicking clicking the distribute button without any changes. The implementation uses the same calculation and distribution logic as the manual window, ensuring consistent behavior.
- **Query Window Toolbar Buttons**: Fixed "Send to Chat" and "Copy to Clipboard" toolbar buttons in the query window not finding message content. The issue was caused by attempting to scope queries to the window element after v13 migration, which failed when multiple query windows were open or when viewing recent queries. Simplified the implementation to use `document.querySelector` with `data-message-id` attribute selectors, which works reliably since each message has a unique messageId. Updated all three toolbar button handlers (`_onSendToChat`, `_onCopyToClipboard`, `_onSendToJson`) to use the simplified approach with proper button parameter handling.
- **Toolbar Button Double Events**: Fixed external module toolbar buttons generating duplicate events (2 chat cards) when a tool was registered for both CoffeePub and Foundry toolbars. The issue was caused by both `_wireToolClicks` and `_wireFoundryToolClicks` attaching handlers to the same buttons regardless of which toolbar was active. Added active control checks to each function so `_wireToolClicks` only wires handlers when the CoffeePub toolbar (`blacksmith-utilities` control) is active, and `_wireFoundryToolClicks` only wires handlers when the Foundry toolbar (`tokens` control) is active. This prevents double-wiring when tools appear in both toolbars, ensuring each button click generates only one event.
- **Combat Stats Round Number**: Fixed round number in combat stats cards to use the actual round number from `game.combat.round` instead of maintaining our own counter. Cards now correctly display the current combat round matching the Encounter Tracker.
- **Multiple Combat Timers on Creation**: Fixed issue where multiple combat timers were being created when combat was first created. The timer logic now only processes when `combat.started === true`, preventing timers from starting during combat creation when `updateCombat` hooks fire multiple times (e.g., when adding combatants). Timers will only start when combat is actually started (when "Start Combat" is pressed), not during the creation phase.
- **Combat Tracker Health Ring Visibility**: Fixed combat tracker health ring display for players. Players now see health rings for other players (player-owned actors) showing actual health status, while NPCs display a solid decorative ring (rgba(247, 243, 232, 0.3)) when the `combatTrackerHideHealthBars` setting is enabled. GMs continue to see health rings for all combatants (unless NPC health is hidden). This ensures visual consistency in the combat tracker while respecting privacy settings for NPC health information.

## [13.0.8]

### Fixed
- **External Module Tools Not Appearing**: Fixed external module tools (e.g., bibliosoph) not appearing in the CoffeePub toolbar. The issue was caused by:
  - `onCoffeePub` property filtering not properly handling function values - added `isOnCoffeePub()` helper to evaluate both boolean and function values
  - Missing `name` property defaults for external tools - now defaults to `toolId` if not provided
  - Missing `button`, `title`, and `icon` property defaults - now provides sensible defaults for v13 compatibility
- **Foundry Toolbar Labels and Formatting Missing**: Fixed zone labels, dividers, and formatting not appearing on the core Foundry toolbar (tokens control). Updated `_applyZoneClasses()` to handle both CoffeePub toolbar (`blacksmith-utilities` control) and Foundry toolbar (`tokens` control) by checking the active control and applying zone classes accordingly.
- **Foundry Toolbar Zone Organization**: Fixed tools appearing in wrong zones between CoffeePub toolbar and Foundry toolbar. Updated `getFoundryToolbarTools()` to organize tools by zone and sort by order (matching `getVisibleToolsByZones()` logic), ensuring consistent zone grouping across both toolbars.
- **Foundry Toolbar Timing Issue**: Fixed Blacksmith's own buttons (request roll, replace image) not showing up in the core Foundry toolbar when using `onFoundry()` functions that read settings. Changed `onFoundry` implementations to use `getSettingSafely()` helper instead of manually checking setting availability, preventing tools from being filtered out before settings are registered.
- **General Zone CSS Styling**: Fixed "general" zone tools not receiving proper styling. Added fallback CSS selectors that don't require the `tool` class, ensuring zone classes apply correctly even when buttons don't have the expected class structure.
- **SceneControls Rendering Lifecycle (v13)**: Fixed toolbar tools not persisting after registration by correctly implementing FoundryVTT v13's SceneControls rendering lifecycle:
  - Replaced manual `controls` object manipulation with `ui.controls.render({ reset: true })` to trigger Foundry's internal rebuild pipeline
  - Removed problematic `ui.controls.controls = controls` assignment (read-only getter in v13)
  - Added debounced `requestControlsRender()` to prevent render loops
- **Early Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tokens')` and similar errors during early initialization by:
  - Adding `safeActiveToolName()` and `safeActiveControlName()` helper functions that wrap `ui.controls` access in try-catch blocks
  - Replacing all direct `ui.controls.control?.name` and `ui.controls.tool?.name` accesses with safe helpers
  - Removing `game.activeTool` and `game.activeControl` references that don't exist in v13
- **ReferenceError: activeTool is not defined**: Fixed `activeTool` variable not being declared in `getSceneControlButtons` hook callback scope.
- **Excessive Debug Logging**: Removed all debug logging related to toolbar state, tool registration, and DOM manipulation that was added during troubleshooting.

### Changed
- **Request Roll Tool Organization**: Moved "Request a Roll" tool from "rolls" zone to "gmtools" zone to better reflect its GM-only nature.
- **Request Roll Toolbar Visibility**: Changed request roll tool from hardcoded `onFoundry: true` to read from `requestRollShowInFoundryToolbar` setting, allowing users to control Foundry toolbar visibility independently.
- **Toolbar Display Settings**: Replaced two separate boolean settings (`toolbarShowDividers` and `toolbarShowLabels`) with a single dropdown setting (`toolbarDisplayStyle`) with three options:
  - "Foundry Default" (no organization)
  - "Category Dividers" (visual separators)
  - "Category Labels" (text labels)
  - Default is "Category Labels"
  - Prevents users from enabling both dividers and labels simultaneously
- **Request Roll Menubar Visibility**: Added `requestRollShowInMenubar` setting to control request roll tool visibility in the menubar, allowing independent control from toolbar visibility.

### Added
- **Request Roll Toolbar Settings**: Added two new settings for controlling request roll tool visibility:
  - `requestRollShowInFoundryToolbar` - Control visibility in Foundry toolbar (default: false)
  - `requestRollShowInMenubar` - Control visibility in menubar (default: true)
- **Toolbar Display Style Setting**: Added `toolbarDisplayStyle` dropdown setting to replace the previous two boolean settings, providing a cleaner interface for toolbar organization preferences.

## [13.0.7]

### Added
- **Portrait Replacement Filtering Options**: Added the same filtering options for portrait image replacement that were previously available for token replacement. Portrait replacement now supports independent toggles for:
  - Update Monsters (`portraitImageReplacementUpdateMonsters`)
  - Update NPCs (`portraitImageReplacementUpdateNPCs`)
  - Update Vehicles (`portraitImageReplacementUpdateVehicles`)
  - Update Actors (`portraitImageReplacementUpdateActors`)
  - Skip Linked Tokens (`portraitImageReplacementSkipLinked`)
  These settings allow fine-grained control over which actor types have their portraits automatically replaced, matching the functionality available for token image replacement.
- **Card Theme System Documentation**: Added `migration-cards.md` documentation outlining the migration plan for converting hardcoded colors in card-specific CSS files to use the new CSS variable theme system.
- **Folder Progress Display**: Added folder number display to scan progress messages. Progress now shows "Folder X of Y | Phase X of Y" when scanning multiple image folders, indicating which configured folder is currently being processed.

### Changed
- **Token and Portrait Replacement Filtering**: Enhanced both token and portrait image replacement processing to respect actor type and linked token settings. Both systems now check actor type (monster, NPC, vehicle, character) and linked token status before processing replacements, ensuring consistent behavior across both replacement modes. Added `_shouldUpdateActor()` helper function that centralizes the filtering logic for both token and portrait replacement.
- **Card CSS Architecture Refactoring**: Refactored card CSS system to use CSS variables for complete themeability. Separated layout and theme concerns:
  - `cards-common-layout.css` - Contains all layout, spacing, typography, and structure (uses CSS variables)
  - `cards-common-themes.css` - Contains only color definitions via CSS variables
  - All CSS variables are namespaced with `blacksmith-card-` prefix to avoid conflicts with other modules
  - Default variable values defined in `:root {}` for proper CSS inheritance
  - Theme classes only override CSS variable values, never layout properties
  - Used attribute selector `[class*="theme-"]` for theme-specific layout adjustments to automatically support new themes
- **XP Card Theme Migration**: Migrated XP distribution chat cards to use the `blacksmith-card` theme system, matching the structure used by skill check cards. Cards now use `.card-header` and `.section-content` classes from the theme system for consistent styling.
- **Card CSS Namespacing**: All card-related CSS classes are now properly namespaced with `.blacksmith-card` prefix to avoid conflicts with other modules. Section headers, content areas, and all card components are scoped to `.blacksmith-card` selectors.
- **Root Folder Categorization**: Improved categorization logic for files located directly in the root of image directories. Files in the root are now categorized by the root folder name instead of appearing under "all". If a root directory contains only files (no subfolders), the root directory name is used as the category. If a root directory contains both files and subfolders, root files use the root directory name as their category while subfolder files behave normally.

### Fixed
- **Incremental Update Performance**: Fixed incremental updates being significantly slower than full scans by removing artificial delays during incremental update operations. Incremental updates now skip delays that were intended for UI visibility during full scans, making them faster than full rescans.
- **Incremental Update Accuracy**: Fixed incremental update system to properly detect and remove deleted files and renamed folders. The system now correctly identifies files that no longer exist in the file system and removes them from the cache, preventing empty categories from appearing.
- **Empty Folder Cleanup**: Fixed orphaned folder entries remaining in categories after files are deleted. Added cleanup logic that runs after all incremental updates complete to remove empty or invalid folder entries from the cache.
- **Category Button Updates**: Fixed category buttons not updating correctly after incremental scans. Categories now properly reflect the current state of the file system, with deleted folders removed and new categories added as needed.
- **System File Scanning**: Fixed system files (desktop.ini, thumbs.db, .DS_Store, folder.jpg, folder.png, .gitignore, .gitkeep) being scanned and displayed in progress messages. System files are now filtered out early in the scanning process before being displayed or processed.
- **Incremental Update Errors**: Fixed `newFileCount is not defined` error in incremental update completion messages by using the correct `finalFileCount` variable.
- **Folder Cache Type Errors**: Fixed `cache.folders.get(...).push is not a function` errors by adding defensive checks to ensure folder entries are always arrays before calling array methods.

## [13.0.6]

### Added
- **Image Replacement Variability**: Added variability feature for both token and portrait image replacement. When enabled, the system randomly selects from all images with the highest matching score instead of always using the same top match. This adds visual variety when multiple tokens or actors of the same type are created. Variability is enabled by default for both tokens and portraits, with separate settings (`tokenImageReplacementVariability` and `portraitImageReplacementVariability`) that can be toggled independently. The feature respects the existing matching threshold setting, only considering matches above the threshold.
- **Portrait Image Replacement Update Dropped**: Added portrait-specific "Update Dropped Portraits" toggle that works independently from token image replacement. When enabled, actor portraits are automatically updated with the best matching portrait when tokens are created on the canvas. This complements the existing token image replacement feature, allowing both token images and actor portraits to be updated automatically when tokens are dropped.

### Changed
- **Image Replacement Global Controls Layout**: Restructured the global controls header in the image replacement window. The Token/Portrait mode toggle is now left-aligned with "Tokens" label on the left and "Portraits" label on the right of the toggle for clarity. Other global controls (Loot Piles, Convert Dead) are right-aligned. Added CSS styling for the new layout structure.
- **Image Replacement Match Display**: Updated matching logic so that match percentages are always displayed when a token or actor is selected, regardless of which filter button is active (ALL, category buttons, SELECTED). Previously, match percentages only appeared on the SELECTED tab. This ensures consistent visual feedback across all filter modes.
- **Cinematic Roll Button Visual Feedback**: Added color-coded background styling for advantage/disadvantage modifier buttons in cinematic roll window. Disadvantage buttons now have a red tint (`rgba(148, 9, 9, 0.5)`) and advantage buttons have a green tint (`rgba(22, 77, 11, 0.5)`) to provide clear visual distinction between roll types.
- **Skill Check Card Theme Migration**: Migrated skill check chat cards to use the `blacksmith-card` theme system for consistent styling and v13 compatibility. Cards now leverage the standard `.card-header` styling from the theme instead of custom header styles.
- **Card CSS Organization**: Moved all skill check card-related CSS from `window-skillcheck.css` to dedicated `cards-skill-check.css` file for better modularity and maintainability.
- **Template Naming**: Renamed skill check card template from `skill-check-card.hbs` to `card-skill-check.hbs` to match naming conventions with other card templates.

### Fixed
- **Cinematic Window Circular Buttons**: Fixed circular buttons (dice roll buttons and close button) in the cinematic roll window appearing elliptical/horizontally compressed after v13 migration. Added `box-sizing: border-box`, `min-width`, `min-height`, and `aspect-ratio: 1` to ensure buttons maintain perfect circular shape. Buttons now display correctly as circles regardless of flex container constraints.
- **Cinematic Button Icon Alignment**: Fixed icon misalignment in cinematic roll buttons caused by unnecessary `padding-left: 3px` on icons. Removed padding since flexbox centering (`justify-content: center` and `align-items: center`) already properly centers icons. Added explicit `padding: 0` and `margin: 0` to roll area container to prevent any default spacing issues.
- **Unused Code Cleanup**: Removed unused `getResultSound()` function from `window-skillcheck.js` that was never called. Sound logic is handled directly in `deliverRollResults()` and `updateCinemaOverlay()` functions.
- **Long Name Ellipsis**: Fixed ellipsis for long actor names in roll buttons, ensuring names truncate properly with ellipsis in both pre-roll (pending roll buttons) and post-roll (completed roll results) states. Added proper flex container constraints and `min-width: 0` to all parent containers to allow proper text overflow handling.

## [13.0.5]

### Fixed
- **Journal Tools querySelector Error**: Fixed `TypeError: nativeElement.querySelector is not a function` in Journal Tools window. Updated `_getNativeElement()` method to include jQuery detection and validation, ensuring it returns a valid native DOM element with `querySelector` method before use. Matches the pattern used in other windows for v13 compatibility.
- **SceneControls Initialization Errors**: Fixed `TypeError: Cannot read properties of undefined (reading 'tools')` errors from third-party modules (tile-sort, monks-wall-enhancement, walledtemplates, multi-token-edit) when `refreshSceneControls()` was called before controls were fully initialized. Added validation checks to ensure controls object exists, is populated, and `ui.controls` has been rendered before calling `getSceneControlButtons` hook. Additionally restricted `refreshSceneControls()` to only run for GMs since players don't have access to scene controls, preventing 96+ errors for players when other modules try to access controls that don't exist for them.
- **Menubar Health Tooltip Privacy**: Fixed menubar combat portrait tooltips showing HP information when health rings are hidden. Tooltips now conditionally exclude HP information when `menubarCombatHideHealthBars` is enabled for non-GM users, matching the health ring visibility behavior. GMs always see full tooltip information regardless of the setting.
- **Menubar Token Panning Visibility**: Fixed menubar combat portrait clicks panning to tokens that players cannot see. Panning now checks token visibility for non-GM users, including hidden status, canvas visibility, and user visibility (vision/walls). Players can only pan to tokens they can actually see on the canvas. GMs can always pan to any token. Fixed token highlight method to use `setHighlight()`/`clearHighlight()` instead of deprecated `highlight()` method.
- **Combat Tracker and Menubar Hidden Token Visibility**: Fixed hidden tokens and hidden combatants not being properly handled in both combat tracker and menubar. Hidden combatants (via `combatant.hidden` or `token.hidden`) now immediately disappear from players' view in both locations, matching the combat tracker's native behavior. GMs always see all combatants with visual indicators: `hide` class in combat tracker and `combat-token-hidden` class in menubar for styling purposes. When a token is hidden on the canvas, it is also hidden in the combat tracker for players, ensuring consistent visibility rules across all combat interfaces.
- **Effects Panel Menubar Overlap**: Fixed effects panel overlapping with the menubar when present. The effects panel now shifts down by the menubar height using `calc(5px + var(--blacksmith-menubar-interface-offset))` to preserve its original 5px top offset while accounting for the fixed menubar, matching the behavior of other UI elements like chat.
- **Clarity Mode GM-only Brightness**: Reworked clarity brightness to be GM-local only using a PIXI color-matrix filter on the client; no `scene.update` calls so players are unaffected. Restores cleanly on deactivate and across scene changes.
- **Clarity Mode Vision Override**: While clarity is active, GM disables token-only vision (`canvas.sight.tokenVision = false`) to keep the whole scene visible even with a selected token; restores the original setting on deactivate. Fog transparency remains a client-only 10% alpha tweak for the GM.
- **Clarity Token Overlays**: Updated hatch overlay asset (overlay-pattern-04) and ensured overlays reapply on token control without affecting players.

## [13.0.4]

### Fixed
- **Combat Tracker Health Ring Alignment**: Fixed health rings misaligning with portraits when combatant names wrap to multiple lines. The ring container now takes the full height of the combatant and centers the ring vertically using CSS-only solution, eliminating the need for JavaScript positioning calculations and ResizeObserver.
- **SceneControls Deprecation Warning**: Replaced deprecated `SceneControls.initialize()` calls with v13+ `render({controls, tool})` API. Created `refreshSceneControls()` helper function that rebuilds controls via `getSceneControlButtons` hook and renders with the updated controls, preserving active tool state. This eliminates deprecation warnings and ensures compatibility with Foundry v15.
- **Combat Tracker NPC Health Ring Visibility**: Fixed NPC health rings being visible to players in the combat tracker. Health rings for NPCs are now hidden from non-GM users when the `combatTrackerHideHealthBars` setting is enabled, matching the menubar behavior. GMs always see health rings for all combatants regardless of the setting.

## [13.0.3] - Sockets

### Fixed
- **Journal Double-Click Image Editing**: Simplified image double-click handler in edit mode to directly click the image toolbar button instead of attempting to access Prosemirror internals. This provides a more reliable and maintainable solution that works consistently.
- **Encounter Toolbar Page Navigation**: Fixed encounter toolbar disappearing when switching between journal pages. The toolbar now correctly detects page navigation, finds the active page (not just any page), cleans up old toolbars from previous pages, and processes toolbar updates even when app window lookup fails. Increased delays to ensure active page class has settled before processing.
- **Socket API Timing Issues**: Fixed race condition where `module.api.sockets` was set asynchronously after `module.api` was created, causing external modules to fail when accessing the socket API. Added polling mechanism in `BlacksmithAPI.getSockets()` to wait up to 2 seconds for socket API initialization.
- **Socket API SocketLib Compatibility**: Fixed socket API to properly work with SocketLib sockets, which use `executeForOthers()` pattern instead of `emit()`. Added wrapper that translates `emit()` calls to SocketLib's execution pattern for external modules while maintaining backward compatibility with internal Blacksmith code.
- **Socket API Native Fallback**: Fixed native socket fallback to include `emit()` method, ensuring the socket API works whether SocketLib is available or not. Native fallback now properly implements the full socket interface.
- **Socket API Global Access**: Added `window.Blacksmith.socket` global alias for backward compatibility with documented access patterns.

### Changed
- **Socket API Logging**: Reduced verbose logging for socket event registration to only log on first registration per event name to reduce console spam.

### Added
- **Socket API Documentation**: Updated `api-sockets.md` with multiple access patterns and timing-aware initialization examples to help external modules properly use the socket API, including proper handling of asynchronous socket initialization.

## [13.0.2] - v13 Migration

### Fixed
- **Toolbar - External Module Tool Registration:** Fixed external modules' tools not appearing in CoffeePub toolbar
  - Added automatic toolbar refresh when tools are registered via `registerToolbarTool()` API
  - Tools now appear immediately after registration without requiring manual refresh
  - Added debug logging to help diagnose tool registration issues
- **Toolbar - v13 SceneControl Structure:** Fixed `TypeError: Cannot read properties of undefined (reading 'onChange')` when switching toolbars
  - Updated control structure to match v13 `SceneControl` interface requirements
  - Added required `activeTool` property (must point to valid tool key)
  - Added required `onChange` and `onToolChange` handlers on control
  - Added required `order` and `visible` properties
  - Changed from deleting/recreating control to updating in place to preserve Foundry's tool references
  - Merged tools instead of replacing entire tools object to prevent reference loss
- **Toolbar - Auto-Activation of Tools:** Fixed tools auto-triggering when control opens (e.g., "Request a Roll" dialog opening automatically)
  - Removed `onClick` from `SceneControlTool` objects (v13 compatibility shim auto-calls it from `onChange`)
  - Changed `onChange` handlers to no-ops that never call `tool.onClick`
  - Implemented `_wireToolClicks()` to attach real DOM click handlers directly to rendered buttons
  - Tool buttons now respond only to actual user clicks, not control activation
  - Prevents v13 compatibility shim from auto-calling `onClick` on control activation
- **Toolbar - Tool Button Clicks:** Fixed tool buttons not responding to clicks in CoffeePub toolbar
  - Implemented direct DOM event handlers via `_wireToolClicks()` function
  - Handlers attached to rendered `<button data-tool="...">` elements after toolbar renders
  - Works correctly even when clicks occur on tooltip elements (ASIDE)
  - Handlers prevent default behavior and stop propagation to avoid conflicts with Foundry's toggle logic
- **Toolbar - Tool Updates:** Fixed tool updates not preserving Foundry's internal references
  - Changed from replacing entire tools object to merging tools in place
  - Preserves active tool references when updating control
  - Explicitly removes `onClick` from updated tools to prevent shim issues
- **Settings UI - v13 CSS Selectors:** Fixed settings styling not applying due to v13 DOM structure changes
  - Replaced `data-setting-id` attribute selectors (removed in v13) with `:has()` selectors targeting `label[for]` attributes
  - Updated all selectors from `div[data-setting-id*="coffee-pub-"]` to `.form-group:has(label[for*="settings-config-coffee-pub-"])`
  - Changed `.notes` class references to `.hint` (v13 renamed the class)
  - Added missing color declarations for light mode (labels, hints) that were previously inherited from Foundry defaults
  - Settings now properly styled in v13's new HTML structure
- **Settings UI - Dark Mode Support:** Fixed dark mode styles not applying
  - Changed dark mode selectors from `html.theme-dark` to `[data-theme="dark"]` to match Foundry v13's theme attribute on `<body>`
  - Added comprehensive dark mode color overrides for all heading levels (H1, H2, H3, H4) and general settings
  - Dark mode now properly detects and applies theme-specific colors for backgrounds, text, and borders
  - Settings UI now fully supports both light and dark themes

### Changed
- **Toolbar API - Tool Registration:** Enhanced `registerToolbarTool()` to automatically refresh toolbar
  - Toolbar now refreshes automatically after tool registration
  - Re-triggers `getSceneControlButtons` hook to rebuild toolbar with new tools
  - Added debug logging for tool registration status
- **Toolbar - v13 Migration:** Migrated toolbar to v13 `SceneControl` interface
  - Tools use `onChange` as no-ops (v13 requirement) but never call `tool.onClick`
  - Real click handling done via direct DOM event handlers in `_wireToolClicks()`
  - Control structure matches v13 requirements exactly
  - All tools have proper `onChange` handlers (no-op for button tools)
- **Settings UI - v13 CSS Migration:** Migrated settings CSS to v13 HTML structure
  - Replaced deprecated `data-setting-id` attribute targeting with `:has()` pseudo-class selectors
  - Updated class names from `.notes` to `.hint` to match v13 naming
  - Added explicit color declarations for all text elements (previously relied on Foundry defaults)
  - Implemented dark mode support using `[data-theme="dark"]` attribute selector
  - All heading types (H1, H2, H3, H4, HR, SP) now have proper light and dark mode styling

### Technical
- **Toolbar - v13 Compatibility:** Addressed v13 compatibility shim behavior
  - v13 automatically calls `onClick` from inside `onChange` when tool is activated
  - Solution: Don't define `onClick` on `SceneControlTool`, make `onChange` a no-op, and wire real DOM click handlers
  - `_wireToolClicks()` attaches event listeners directly to rendered buttons, bypassing v13's shim entirely
  - This approach completely avoids auto-activation issues and provides reliable click handling
- **Toolbar - Reference Preservation:** Improved tool reference handling
  - Update tools in place using `Object.assign` to preserve Foundry's internal references
  - Merge tools instead of replacing entire object
  - Preserve active tools when they're being removed (mark as invisible instead of deleting)
- **Settings UI - v13 Theme Detection:** Updated theme detection mechanism
  - Foundry v13 uses `data-theme="dark"` attribute on `<body>` element instead of `html.theme-dark` class
  - Changed all dark mode selectors from `html.theme-dark` to `[data-theme="dark"]`
  - Theme detection now correctly matches Foundry's v13 implementation
  - Why: v13 changed from class-based theme detection to data attribute-based detection for better flexibility


## [13.0.1] - v13 Migration

### Fixed
- **Combat Tracker - Health Ring Alignment:** Fixed health rings not aligning correctly over token/portrait images in the combat tracker
  - Updated CSS positioning for `.health-ring-container` and SVG elements
  - Changed insertion logic to insert health ring container right before token image element
- **Combat Tracker - Roll Remaining Button:** Fixed "Roll Remaining" button not appearing in combat tracker
  - Migrated button creation to native DOM methods (removed jQuery dependency)
  - Updated button structure to match v13 format with `data-action` attribute
  - Improved insertion logic with multiple search roots for better compatibility
  - Fixed event listener removal to use native `removeEventListener` instead of jQuery
  - Increased hook priority to ensure button appears after other combat tracker elements
- **Combat Tracker - Planning Timer:** Fixed multiple planning timer issues
  - Fixed timer not being visible or clickable
  - Fixed timer showing "0s Planning" when active (state initialization issue)
  - Fixed timer not gracefully disappearing after planning ended
  - Fixed excessive re-renders by adding initiative check before showing timer
  - Fixed timer appearing before all initiatives were rolled
  - Changed HTML structure from `.combatant.planning-phase` to `.planning-timer-item` to avoid CSS conflicts
  - Updated CSS to force visibility with important flags
  - Enhanced fade-out to work in both sidebar and popout windows
  - Fixed setting access errors by using `getSettingSafely` utility
- **Combat Tracker - Combat Timer:** Fixed combat timer visibility and timing issues
  - Fixed timer not showing in popped-out combat window
  - Fixed timer not being clickable
  - Fixed timer showing before all initiatives were rolled
  - Updated selectors from `#combat-tracker` to `.combat-tracker` for v13 compatibility
  - Enhanced `updateUI()` to find timer elements in both sidebar and popout windows
- **Combat Tracker - Popout Window Closing:** Fixed popped-out combat window not closing when combat ends
  - Enhanced `closeCombatTracker()` to check multiple ways to find and close popout window
  - Added direct DOM lookup for `#combat-popout` element
  - Added fallback to click close button if Application instance not found
  - Made `endCombat` hook callback async to properly await window closing
- **XP Distribution Window:** Fixed jQuery-related errors in XP distribution window
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelector is not a function` errors in multiple methods
  - Added jQuery detection and conversion for all DOM queries
  - Updated `_updateXpDisplay()`, `_getIncludedPlayerCount()`, `_updateXpDataPlayers()`, `_onModeToggleChange()`, and `_collectMilestoneData()` methods
- **CSS Editor Window:** Fixed jQuery-related errors in CSS Editor
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `Cannot read properties of undefined (reading 'toggle')` error
  - Added jQuery detection and conversion for `html` and `this.element` in all methods
  - Fixed World Settings button to open World Config instead of general settings
  - Added missing `_resetApplyButton` method
  - Updated `render()`, `_updateObject()`, `_setupSearchListeners()`, `_performSearch()`, `_highlightCurrentMatch()`, `_replaceCurrent()`, and `_replaceAll()` methods
- **Journal Tools Window:** Fixed jQuery-related errors in Journal Tools
  - Fixed `html.querySelector is not a function` error in `activateListeners`
  - Fixed `this.element.querySelectorAll is not a function` and `this.element.querySelector is not a function` errors
  - Added `_getNativeElement()` helper method for jQuery detection
  - Fixed journal page opening when clicking "replace title" in search results
  - Added `_viewJournalPage` helper method with multiple strategies for opening journal pages
  - Added missing `_resetApplyButton` method
  - Updated all methods to use native DOM after jQuery detection
- **Blacksmith Window Query:** Fixed jQuery-related errors in query window
  - Fixed `html.querySelector is not a function` and `html.querySelectorAll is not a function` errors
  - Fixed `html.addEventListener is not a function` error
  - Fixed `this.element.querySelector is not a function` errors in `displayMessage()` and other methods
  - Added `_getNativeElement()` helper method for jQuery detection
  - Added drop zone handlers for criteria drop zone in assistant workspace (skill check assistant)
  - Updated `activateListeners()`, `initialize()`, `displayMessage()`, `_scrollToBottom()`, and `switchWorkspace()` methods

### Changed
- **jQuery Removal:** Continued migration from jQuery to native DOM methods across all application windows
  - All application windows now handle native DOM elements with jQuery detection fallbacks
  - Added `_getNativeElement()` helper method pattern for consistent jQuery detection
  - Replaced jQuery event handlers with native `addEventListener`
  - Replaced jQuery DOM manipulation with native methods (`querySelector`, `appendChild`, `insertBefore`, etc.)
  - Updated XP Distribution, CSS Editor, Journal Tools, and Blacksmith Window Query windows
- **Combat Tracker Structure:** Updated combat tracker HTML structure for v13 compatibility
  - Planning timer now uses `.planning-timer-item` class instead of `.combatant.planning-phase`
  - Roll Remaining button now uses `<button>` element with v13-compatible attributes
  - All selectors updated to match v13 DOM structure
- **Query Tool - Assistant Workspace:** Added drop zone functionality for skill check assistant
  - Added event handlers for criteria drop zone to accept token, actor, and item drops
  - Drop zone now populates skill check form fields automatically when items are dropped
  - Supports drops from canvas (tokens) and sidebar (actors and items)

### Technical
- **Initiative Checks:** Added initiative validation before showing timers
  - Planning timer and combat timer now only appear after all combatants have rolled initiative
  - Prevents timers from appearing prematurely and reduces unnecessary re-renders
- **Hook Priorities:** Adjusted hook priorities for proper execution order
  - Roll Remaining button hook priority set to 5 (runs after planning timer at priority 3)
  - Ensures proper element insertion order in combat tracker
- **Error Handling:** Improved error handling for async operations
  - Added proper delays and error handling for window closing operations
  - Enhanced fallback mechanisms for finding and closing popout windows

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- All combat tracker functionality has been restored and tested in v13
- jQuery removal is complete for combat tracker components and all major application windows
- All application windows (XP Distribution, CSS Editor, Journal Tools, Blacksmith Window Query) now use native DOM with jQuery detection fallbacks


## [13.0.0] - v13 Migration Begins

### Important Notice
- **v13 MIGRATION START:** This version begins the migration to FoundryVTT v13
- **Breaking Changes:** This version requires FoundryVTT v13.0.0 or later
- **v12 Support Ended:** v12.1.23-FINAL was the last version supporting FoundryVTT v12

### Changed
- **Minimum Core Version:** Updated to require FoundryVTT v13.0.0
- **Module Version:** Bumped to 13.0.0 to align with FoundryVTT v13
- **Compatibility:** Module now exclusively supports FoundryVTT v13

### Technical
- **Migration Status:** Beginning v13 migration work
- **Breaking Changes:** Will address v13 API changes including:
  - `getSceneControlButtons` hook API changes (controls from array to object)
  - jQuery removal (migrating to native DOM methods)
  - ApplicationV2 framework migration (planned for future versions)

### Migration Notes
- See `documentation/migration-v13.md` for detailed migration documentation
- See `documentation/migration-v13-plan.md` for migration plan and progress tracking
- This version may have incomplete v13 compatibility - migration work in progress

## [12.1.23] - Final v12 Release

### Important Notice
- **FINAL v12 RELEASE:** This is the final build of Coffee Pub Blacksmith compatible with FoundryVTT v12
- **v13 Migration:** All future builds will require FoundryVTT v13 or later
- **Breaking Changes:** Users must upgrade to FoundryVTT v13 to use future versions of this module

### Changed
- **Documentation Updates:** Updated README.md and module.json to reflect v12.1.23 as the final v12 release
- **Compatibility Notice:** Added clear notice that v12.1.23 is the last version supporting FoundryVTT v12
- **Migration Preparation:** Module is now locked for v12 compatibility; v13 migration work will begin in next version

### Technical
- **Version Lock:** Module version locked at 12.1.23-FINAL for v12 compatibility
- **Future Development:** All development moving forward will target FoundryVTT v13 exclusively

## [12.1.22]

### Added
- **Compendium Table Import Support:** Added comprehensive compendium table import functionality for both items and actors
  - New "Compendium Items" template option for rolltable imports
  - New "Compendium Actors" template option for rolltable imports
  - Dynamic compendium list generation from configured settings
  - Formatted item/actor lists with compendium names and entries
  - Template placeholders automatically populated with user's configured compendiums

### Fixed
- **Table Import Range Calculation:** Fixed critical bug in table range calculation logic
  - Properly handles explicit range bounds (rangeLower and rangeUpper)
  - Correctly calculates ranges when only lower bound is provided
  - Prevents gaps and overlaps in range assignments
  - Added validation to ensure rangeLower <= rangeUpper
- **Dynamic Table Formula:** Fixed hardcoded "1d100" formula to dynamically calculate based on actual table range
  - Formula now automatically adjusts to match maximum range value (e.g., 1d20, 1d500)
  - Ensures formula always matches the table's actual range coverage
- **Compendium Type Mapping:** Fixed compendium result type mapping for FoundryVTT compatibility
  - Correctly maps "Compendium" type to "pack" (FoundryVTT's actual type name)
  - Properly sets `documentCollection` field for pack-type results
  - Ensures compendium dropdowns select correct compendium on import
- **ImageCacheManager.addTagToFile Error:** Fixed "addTagToFile is not a function" error when toggling favorites
  - Removed redundant calls to non-existent `addTagToFile()` and `removeTagFromFile()` functions
  - Tags are already updated directly in fileInfo.metadata.tags array
  - Favorite toggle functionality now works correctly

### Changed
- **Table Import UI:** Improved table import dropdown labels for better clarity
  - Simplified option names (e.g., "Simple Text" instead of "Simple Text Rollable Table")
  - Reorganized options for better logical grouping
  - Updated button text to "Copy Template" for consistency

## [12.1.21] - 2025-11-13

### Added
- **Loot Pogs:** Added new images for when tokens are converted to loot.

### Fixed
- **Loot Conversion Sound:** Honored the "No Sound" option by skipping playback when `tokenLootSound` is disabled.
- **Loot Conversion Image:** Restricted loot image swaps to cases where the Item Piles module is active and rely on Item Piles' `keepOriginal` handling instead of forcing a new texture.
- **Loot Image Preservation:** Restoring a loot pile now updates the token document reliably so the original art persists after refresh.
- **Loot Table Quantities:** Loot item counts now randomize between 1 and the configured quantity setting instead of using roll result ranges.
- **Loot Coin Setting:** Coins are only added when the `tokenLootAddCoins` toggle is enabled.
- **Epic Loot Odds:** Epic loot tables now respect the configured odds and always award a single item when triggered.
- **Loot Coin Maximums:** Coin rewards now roll between 1 and the per-currency maximum settings (including electrum) instead of using a static percentile table.
- **Dead Token Toggle:** Dead token replacement now correctly follows the `enableDeadTokenReplacement` setting in both UI and automation hooks.
- **Indicator Visibility:** Current-turn and targeted rings now respect per-user token visibility, hiding from players when tokens are invisible to them.
- **Combat Bar Details:** Secondary combat bar now reports turn order labels and formatted total combat time.


## [12.1.20] - 2025-11-12

### Added
- **Party Statistics Window:** New menubar tool and application providing combat history, lifetime MVP leaderboard, summary chips, and MVP highlights styled after the XP distribution interface.
- **Stats API Exposure:** Stats window data now available through `StatsWindow` and supporting API methods for other modules to consume combat summaries and lifetime MVP data.

### Changed
- **Documentation:** Refreshed `documentation/api-stats.md`, `api-core.md`, and `architecture-stats.md` with updated architecture details, API recipes, retention policies, and integration samples for the stats system.
- **Templates & Styles:** Introduced dedicated `window-stats.hbs` and `styles/window-stats.css` to align party stats UI with the module design system while keeping assets modular for future module splits.

### Fixed
- **Menubar Combat Health Rings:** Health rings now refresh in real time by listening to `updateActor` and `updateToken` hooks and re-rendering the combat secondary bar whenever combatant HP changes.
- **Menubar Visibility Controls:** Honored `excludedUsersMenubar` by skipping menubar/secondary-bar rendering and interactions for listed users, ensuring GM-configured exclusions take effect.
- **NPC Health Privacy Setting:** Added `menubarCombatHideHealthBars` (world) so GMs can hide monster health rings for players while retaining full visibility themselves.


## [12.1.19] - Dynamic Compendium Configuration and Expanded Type Support

### Added
- **Configurable Compendium Counts:** Added per-type settings to configure how many compendium priority slots are available
  - `numCompendiumsActor` - Configure number of Actor compendium slots (1-20, default: 1)
  - `numCompendiumsItem` - Configure number of Item compendium slots (1-20, default: 1)
  - `numCompendiumsSpell` - Configure number of Spell compendium slots (1-20, default: 1)
  - `numCompendiumsFeature` - Configure number of Feature compendium slots (1-20, default: 1)
  - Settings require reload to take effect when changed

- **Selected Compendium Arrays:** New arrays exposed to external modules containing only configured compendiums in priority order
  - `arrSelectedMonsterCompendiums` - Actor compendiums in priority order
  - `arrSelectedItemCompendiums` - Item compendiums in priority order
  - `arrSelectedSpellCompendiums` - Spell compendiums in priority order
  - `arrSelectedFeatureCompendiums` - Feature compendiums in priority order
  - Arrays automatically update when compendium settings change
  - Position in array = Priority (index 0 = Priority 1, etc.)

- **Expanded Compendium Type Support:** Dynamic registration for ALL compendium types found in the system
  - Automatically registers settings for any compendium type (JournalEntry, RollTable, Scene, Macro, Playlist, Adventure, Card, Stack, etc.)
  - All types get full settings support: numCompendiums, searchWorldFirst, searchWorldLast, and priority compendium slots
  - Selected arrays created for all types (e.g., `arrSelectedJournalEntryCompendiums`, `arrSelectedRollTableCompendiums`)
  - No hardcoding required - system adapts to available compendium types

### Changed
- **Compendium Settings Registration:** Refactored from hardcoded Actor/Item/Spell/Feature to fully dynamic system
  - All compendium types now use unified dynamic registration function
  - Settings automatically registered based on types found in system
  - Backward compatible - existing settings and variable names unchanged

- **Compendium Search Logic:** Updated to respect per-type configured counts instead of hardcoded limit of 8
  - `common.js`: Actor and Item compendium search loops now use dynamic counts
  - `manager-compendiums.js`: All compendium type searches respect configured counts
  - `journal-tools.js`: Compendium setting key arrays generated dynamically
  - All search functions now honor user-configured compendium limits

- **Spell and Feature Compendum Filtering:** Switched from content-based to type-based filtering for Spell and Feature compendiums
  - Now uses all Item compendiums like Actor compendiums (simpler and works synchronously)
  - Removed "Spells:" and "Features:" prefixes from dropdown labels since filtering is now type-based
  - Eliminated async complexity from compendium choice initialization
  
- **Removed Duplicate Settings:** Cleaned up duplicate compendium settings from old code organization
  - Removed duplicate `defaultEncounterFolder` setting in favor of `encounterFolder`
  - Removed old hardcoded compendium registration patterns that were superseded by dynamic system
  
- **Code Cleanup:** Removed unused async helper functions from `getCompendiumChoices()`
  - Removed `getContentTypes()` and `buildContentTypeMap()` functions that were no longer needed
  - Simplified compendium choice generation logic

### Fixed
- **Async Function Issue:** Fixed `getCompendiumChoices()` async/await mismatch
  - Function properly marked as `async` to support `await buildContentTypeMap()` call
  - Added `await` when calling `getCompendiumChoices()` in `registerSettings()`
  - Ensures compendium choice arrays are populated before settings registration

- **Race Condition:** Fixed `combatTrackerOpen` setting access before registration
  - Added safety checks using `game.settings.settings.has()` before accessing setting
  - Prevents errors when combat-tracker hook runs before settings are registered
  - Applied to both ready hook and combat start hook contexts
  - Applied to `combatTrackerShowPortraits`, `showRoundTimer`, and `menubarCombatShow`
  - Prevents "setting is not registered" errors during module initialization
  - Imported `getSettingSafely` into affected modules

- **Sync Initialization:** Fixed compendium choices not being available during settings registration
  - Added synchronous initialization of basic compendium choices in `registerSettings()`
  - `getCompendiumChoices()` now runs async in background without blocking settings registration
  - Ensures all compendium dropdowns have choices available immediately

## [12.1.18] - Menubar Performance Optimization, Token Movement Features, and Code Cleanup

### Added
- **Token Movement Sounds:** Complete audio feedback system for token movement
  - Settings for enabling/disabling movement sounds
  - Separate sound selection for player tokens vs monster/NPC tokens
  - Volume control slider (0.0 to 1.0)
  - Distance threshold setting (1-50 feet) to prevent sounds on tiny movements
  - GM-only processing to avoid permission errors
  - Sound plays once (non-looping) and broadcasts to all players
  - Integration with existing movement hooks and automated movement detection

- **Expanded Sound Library:** Added 49 new sound effects across multiple categories
  - **Cartoon Sounds (2):** Tiptoe, Twangs
  - **General Effects (6):** Candle Blow, Cocktail Shaker, Explosion, Owl Hoot, Sad Trombone, Toilet Flushing
  - **Gore Effects (5):** Armor Blood, Blood Splash, Cut Splash, Entrails Splash, Deep Slash
  - **Object Interactions (9):** Chest Lid Open, Chest Open, Chest Poison, Chest Treasure, Lever 01-03, Sack Open Long/Short
  - **Reaction Sounds (18):** Crowd Clapping (Large/Small), Crowd Laughing, Gasp, Grunt Hit/Kick Object, Huzzah, Man Battlecry/Grunt/Huuuragh/Oof/Pain, Wilhelm Scream, Woman Groan/Pain/Scream, plus existing Ahhhhh/Oooooh/Yay
  - **Step Sounds (10):** Beast, Creak 01-03, Metal, Stairs Down/Up, Water, Wood 01-02
  - All sounds organized in subfolders with proper categorization and alphabetical sorting
  - Removed duplicate root folder sounds in favor of organized subfolder versions

### Fixed
- **CRITICAL: Menubar Performance Issue:** Fixed massive performance bottleneck where menubar was re-rendering 14+ times during initialization
  - Root cause: `registerMenubarTool()` was triggering `renderMenubar()` for every single tool registration
  - Solution: Implemented batch tool registration system with single render at completion
  - Added `_isRegisteringTools` flag to prevent renders during tool registration
  - Added `_defaultToolsRegistered` flag to prevent duplicate tool registration
  - Performance improvement: Reduced menubar renders from 14+ to 1 during initialization
  - Tooltip issues resolved as side effect of eliminating constant re-renders

- **Token Image Replacement Threshold Slider:** Fixed threshold slider visibly jumping during image scanning
  - Root cause: `_initializeThresholdSlider()` was being called on every UI re-render during scanning
  - Solution: Added guard clause to prevent re-initialization during active scanning
  - Threshold slider now remains stable during image scanning process

- **Token Rotation Permission Errors:** Fixed permission errors when players tried to rotate tokens
  - Root cause: Token facing logic was running on all clients, causing permission conflicts
  - Solution: Implemented proper permission checking - GM can rotate any token, players can only rotate their own tokens
  - Added `testUserPermission("OWNER")` check for non-GM users
  - Eliminated "User lacks permission to update Token" errors

- **Memory Monitor Tooltip Display:** Fixed memory monitor tooltip showing only memory value instead of detailed information
  - Root cause: Constant menubar re-renders were interfering with tooltip processing
  - Solution: Resolved automatically with menubar performance fix
  - Tooltips now display comprehensive memory breakdown (client heap, server heap, GPU textures)

### Performance
- **Menubar Rendering Optimization:** Dramatically improved menubar initialization performance
  - Eliminated 14+ unnecessary menubar re-renders during tool registration
  - Single render after all tools are registered instead of per-tool renders
  - Expected 90%+ reduction in menubar render operations during module load
  - Improved overall module startup performance

### Code Cleanup
- **Debug Code Removal:** Cleaned up all Phase 1 analysis and debug code
  - Removed verbose comment headers and investigation notes
  - Removed debug logging (`postConsoleAndNotification` calls for monitoring)
  - Removed stack trace logging in `renderMenubar()`
  - Removed "END - HOOKMANAGER CALLBACK" comments
  - Kept only essential functional code and performance optimizations

### Technical Details
- Implemented `MenuBar._isRegisteringTools` flag for batch rendering control
- Implemented `MenuBar._defaultToolsRegistered` flag for duplicate prevention
- Added guard conditions in `registerMenubarTool()` to skip renders during batch operations
- Single `renderMenubar()` call at end of `registerDefaultTools()` instead of per-tool calls
- Maintained all existing functionality while dramatically improving performance

---

## [12.1.17] - Performance Optimizations and Code Cleanup

### Added
- **Memory Monitor Tool:** New performance monitoring tool for the menubar
  - Shows real-time memory usage (client heap, server heap, GPU textures)
  - Configurable poll interval (5 seconds to 5 minutes)
  - Detailed tooltip with comprehensive memory breakdown
  - Click to log detailed memory information to console
  - Cached data to prevent performance impact from frequent API calls

- **Menubar Tool Visibility Settings:** Added individual show/hide controls for menubar tools
  - `Show Settings Tool` - Toggle settings tool visibility (default: hidden)
  - `Show Refresh Tool` - Toggle refresh tool visibility (default: hidden)  
  - `Show Performance Monitor Tool` - Toggle performance monitor visibility (default: hidden)
  - `Performance Monitor Poll Interval` - Slider to set update frequency (5s to 5min, default: 5s)

### Performance
- **Search Performance Dramatically Improved:** Implemented comprehensive caching system for search operations
  - Added LRU cache (50 entries, 5-minute TTL) for search results
  - Cached searches now return results in < 10ms (vs 500-1000ms before)
  - Cache automatically invalidates when filters/tags/categories change
  - Expected 50-90% speedup for repeated searches
  
- **Tag Filtering Optimized:** Pre-compute tags during cache build instead of recalculating on every operation
  - Tags (metadata + creature types + categories) now stored in `file.metadata.tags` during cache build
  - Simplified `_getTagsForFile()` from 50 lines to 10 lines (eliminates heavy Map iterations)
  - Simplified `_getTagsForMatch()` from 65 lines to 18 lines
  - Expected 20-30% speedup on tag filtering operations
  
- **Browse Mode Verified:** Confirmed browse mode uses efficient mapping (no scoring calculations)
  - Browse mode returns results instantly with simple `.map()` operation
  - No relevance calculations performed in browse mode

### Fixed
- **Turn Ring Scene Change Issue:** Fixed turn indicator ring not loading on scene changes
  - Added turn indicator update to `canvasReady` hook callback
  - Turn ring now properly recreates after scene changes using same pattern as death save ring
  - Added safety checks to prevent PIXI graphics destruction errors

- **PIXI Graphics Destruction Safety:** Added safety checks for graphics object destruction
  - Check if graphics object is already destroyed before calling `destroy()`
  - Check if canvas/parent exists before removing from canvas
  - Prevents "Cannot read properties of null" errors during scene changes

- **Progress Bars Not Updating:** Fixed progress bars not showing during image scanning
  - Root cause: `updateScanProgress()` updated window properties but template read from cache properties
  - Solution: Update both window AND cache properties in `updateScanProgress()` and `completeScan()`
  - Added immediate window render when scanning starts to show progress bars
  - Progress bars now show and update correctly during scanning operations

### Removed
- **Legacy Code Cleanup:** Deleted 305+ lines of unused/redundant code
  - Removed entire `_streamSearchResults()` method (215 lines) - legacy duplicate search logic using old scoring
  - Simplified tag extraction methods (90 lines saved)
  - Removed redundant creature type and folder path calculations from UI layer

### Changed
- **Architecture**: Search result cache appropriately placed in UI layer (`token-image-replacement.js`)
  - Cache manager (`manager-image-cache.js`) focuses on file system and persistent storage
  - Matching manager (`manager-image-matching.js`) remains stateless algorithm logic
  - Window (`token-image-replacement.js`) handles UI orchestration and performance caching

### Technical
- Added `_generateSearchCacheKey()` for unique cache key generation
- Added `_getCachedSearchResults()` with TTL expiration checking
- Added `_cacheSearchResults()` with LRU eviction strategy
- Added `_invalidateSearchCache()` called on filter/tag/category changes
- Added `_enhanceFileTagsPostCategorization()` to pre-compute all tags during cache build
- Added performance logging (`console.time/timeEnd`) for search operations

---

## [12.1.16] - Token Image Replacement Fixes and Code Cleanup

### Fixed
- **Category Tooltips Showing 0 Counts:** Fixed category buttons displaying incorrect file counts
  - Root cause: Cache was storing files with empty `path` properties
  - Solution: Updated all filtering methods to extract relative paths from `fullPath` when `path` is empty
  - Applied fix to `_countFilesInCategory()`, `_getFilteredFiles()`, `_getAggregatedTags()`, `_getTagsForMatch()`, and `_getTagsForFile()`
  - Category tooltips now show correct file counts

- **Selected Tab Not Showing Results:** Fixed selected tab filtering to 0 results when token is selected
  - Root cause: Same empty `path` property issue affecting file matching
  - Solution: Updated selected tab filtering logic to properly extract relative paths
  - Selected tab now correctly shows matching files based on token characteristics

- **Favorites Tab Not Showing Actual Favorites:** Fixed favorites tab showing tags but no actual favorited files
  - Root cause: `_getFileInfoFromCache()` was looking up files by empty `fileName` strings
  - Solution: Use file objects directly from cache iteration instead of re-lookup by name
  - Favorites tab now correctly displays all favorited files (ignoring relevance)

- **Tag Display Issues:** Fixed aggregated tags not showing correctly in category and selected modes
  - Root cause: Inconsistent path handling between category discovery and file filtering
  - Solution: Unified path extraction logic across all tag-related methods
  - Tags now display correctly for all filter modes (All, Selected, Favorites, Categories)

### Changed
- **Eliminated Hardcoded Path Assumptions:** Removed all hardcoded folder name assumptions from tag system
  - Replaced hardcoded `ignoredFolders` array with dynamic retrieval from `tokenImageReplacementIgnoredFolders` setting
  - Replaced hardcoded path depth assumptions and `FA_Tokens_Webp` checks with dynamic logic using `tokenImageReplacementPath` setting
  - Module now adapts to any user folder structure without requiring specific naming conventions

- **Code Organization:** Improved separation of concerns in token image replacement system
  - Moved dead token management functions to `token-image-utilities.js` for better organization
  - Updated `ImageCacheManager` to use dynamic category discovery instead of hardcoded categories
  - Added `getDiscoveredCategories()` and `getCategoryFromFilePath()` methods for flexible path handling

### Technical Improvements
- **Dynamic Category Discovery:** Categories are now derived from actual cache data instead of hardcoded assumptions
  - `ImageCacheManager.getDiscoveredCategories()` dynamically discovers top-level categories from `cache.folders`
  - Respects user settings for ignored folders and base path configuration
  - Categories automatically adapt to user's folder structure

- **Consistent Path Handling:** Unified path interpretation across all filtering and tagging methods
  - All methods now consistently use relative paths for category determination
  - Proper fallback from `file.path` to extracted relative path from `file.fullPath`
  - Eliminated inconsistencies between cache storage format and usage patterns

### Code Cleanup
- **Removed Debug Logging:** Cleaned up excessive debug logging that was causing console spam
  - Removed 46,000+ debug log entries that were cluttering console output
  - Kept essential logging for troubleshooting while removing verbose iteration logs

- **TODO List Maintenance:** Cleaned up and reorganized TODO.md for better tracking
  - Removed completed items to focus on active tasks
  - Removed priority numbers and icons for cleaner presentation
  - Marked "Targeted Indicators" as completed
  - Confirmed "HookManager Return Value Handling" was already fixed

### Performance
- **Reduced Memory Usage:** Eliminated unnecessary file lookups in favorites filtering
  - Direct file object usage instead of cache re-lookup reduces function call overhead
  - More efficient filtering logic for large image collections


## [12.1.15] - Memory Leak Fix

### Fixed
- **CRITICAL: Memory Leak (7.9GB RAM Usage):** Fixed catastrophic memory leak causing browser crashes
  - Eliminated temporary window instance creation in `_findBestMatch()` - was creating thousands of full window instances
  - Added static scoring methods to prevent window instance accumulation
  - Fixed unbounded `allMatches` array growth with duplicate detection and 2000 result limit
  - Added comprehensive memory cleanup on window close (arrays, images, event listeners)
  - Explicitly clear image `src` attributes to release decoded image data from browser memory
  - Cancel ongoing searches and timeouts on window close
  - Expected memory usage reduced from 7.9GB+ to under 500MB for 11k+ image cache

- **Category Filter Tabs Broken:** Fixed all category filters returning 0 results
  - Fixed path parsing logic to handle both relative (`Adventurers/...`) and full path formats
  - Applied fix to 3 locations: `_getFilteredFiles()`, `_getAggregatedTags()`, and `_findBestMatch()`
  - Category tabs (Adventurers, Adversaries, Creatures, NPCs) now work correctly

### Changed
- **Result Limits:** Implemented maximum 2000 results per search to prevent memory exhaustion
  - Search stops automatically when limit reached with console notification
  - Duplicate results are now filtered before adding to prevent accumulation

## [12.1.14] - 2025-01-19

### Fixed
- **Cache Validation Bug:** Resolved critical issue where server-side cache was saved successfully but failed validation on load
  - Cache data contained `creatureType` (singular) but validation looked for `creatureTypes` (plural)
  - Added support for both `creatureType`, `creatureTypes`, and compressed `ct` property names
  - Cache validation now handles all property name variations correctly
  - Fixed cache loading after refresh on Molten hosting environments

- **Emergency Cache Recovery:** Fixed cache loading that was incorrectly rejecting valid 3.11MB cache data
  - 11,568 files, 100 folders, and 12 creature types now load successfully
  - Eliminates need to rescan after browser refresh
  - Ensures 29+ minute scan sessions are preserved across sessions

### Changed
- **Cache Property Validation:** Enhanced cache validation to handle multiple property name formats
  - Supports `creatureType` (singular), `creatureTypes` (plural), and `ct` (compressed)
  - Maintains backward compatibility with all existing cache formats
  - More robust validation prevents false cache invalidation

## [12.1.13] - 2025-01-19

### Added
- **Server-Side Cache Storage:** Implemented game.settings-based cache storage for hosted environments
  - Cache now saves to server-side game.settings instead of browser localStorage
  - Persists across browser refreshes and different client connections
  - Compatible with Molten Hosting and other remote FoundryVTT servers
  - Shared cache across all GMs and players in the world
  - Maintains all existing compression and streaming benefits

- **Enhanced Cache Persistence:** Added robust server-side cache management
  - Incremental saves during scan process to preserve progress
  - Final save with complete fingerprint for validation
  - Automatic fallback and validation for cache integrity
  - Console commands updated to show server-side cache status

### Fixed
- **Molten Hosting Cache Loss:** Resolved critical issue where cache was lost on browser refresh
  - localStorage was browser-specific and not persisting on remote servers
  - Cache now stored in world database via game.settings
  - Survives server restarts and browser session changes
  - Works seamlessly across different devices and browsers

- **Cross-Client Cache Sharing:** Fixed issue where cache was isolated per browser session
  - All players and GMs now share the same cached token data
  - No need to rescan when switching devices or browsers
  - Consistent token replacement experience for all users

### Changed
- **Cache Storage Location:** Migrated from localStorage to game.settings
  - Primary storage now in server database (persistent across sessions)
  - Maintains backward compatibility with existing cache format
  - All console commands updated to reflect server-side storage
  - Cache size and compression benefits retained

- **Cache Loading Logic:** Updated to prioritize server-side cache over localStorage
  - Loads from game.settings first, falls back to localStorage if needed
  - Validates cache integrity and version compatibility
  - Clear messaging about cache source (server vs. browser)

## [12.1.12] - Cache Compression

### Added
- **Streaming Cache Compression:** Implemented memory-efficient cache compression system to solve localStorage quota issues
  - Builds compressed cache data without creating full JSON objects in memory
  - Reduces cache size by 40-60% through property name shortening and whitespace removal
  - Handles large token collections (10,000+ files) without quota exceeded errors
  - Backward compatible with existing cache format

- **Enhanced Console Commands:** Added comprehensive cache debugging tools
  - `coffeePubCache.info()` - Display cache statistics (files, folders, creature types, scan status)
  - `coffeePubCache.size()` - Show compressed vs uncompressed cache size with compression ratio
  - `coffeePubCache.version()` - Display cache version and basic information
  - `coffeePubCache.clear()` - Clear cache from localStorage
  - `coffeePubCache.quota()` - Test localStorage quota availability

- **Cache Size Display:** Added cache storage size to UI status display
  - Shows actual localStorage footprint alongside file count and age
  - Updates dynamically when cache changes
  - Format: "1969 files, 0.8 hours old, 0.53MB"

### Fixed
- **localStorage Quota Exceeded:** Resolved critical issue where large token collections (8.64MB+) failed to save
  - Streaming compression prevents memory issues during cache building
  - No longer hits browser localStorage limits (typically 5-10MB)
  - Cache now saves successfully for collections with 10,000+ files

- **Cache Save Reliability:** Improved cache persistence during long scans
  - Streaming compression reduces save failures
  - Better error handling for storage quota issues
  - Fallback mechanisms if compression fails

### Changed
- **Cache Storage Format:** Optimized internal cache structure for better compression
  - Shortened property names (e.g., "fullPath" → "fp", "fileName" → "fn")
  - Removed unnecessary whitespace from JSON structure
  - Maintains full backward compatibility with existing caches

- **Save Progress Messages:** Updated cache save notifications to show actual compressed size
  - Clear indication of storage footprint: "Cache saved: 0.53MB (1969 files)"
  - Removed misleading compression ratio estimates
  - More accurate reporting of actual storage usage


## [12.1.11] - Token Image Replacement Enhancements

### Added
- **3-State Tag Filter Toggle:** Enhanced tag sorting with three modes:
  - Count mode: Sort tags by frequency (default)
  - Alpha mode: Sort tags alphabetically
  - Hidden mode: Completely hide tag container
  - Visual feedback with distinct icons for each mode (fa-filter, fa-filter-list, fa-filter-circle-xmark)
  - Persistent mode selection across sessions

- **Ignored Words Filter:** Added powerful file exclusion system with wildcard support:
  - Completely excludes matching files from cache scanning
  - Supports multiple wildcard patterns: exact match, starts with (*word), ends with (word*), contains (*word*)
  - File extension filtering (e.g., *.png, *.jpg)
  - Tracks and reports ignored file count in scan completion messages
  - Significantly reduces cache size for large token collections

### Fixed
- **Automatic Cache Updates:** Fixed automatic update system to use incremental scans instead of full scans when changes are detected
  - Automatic updates now properly call `_doIncrementalUpdate()` instead of `_scanFolderStructure()`
  - Much faster update performance when "Automatically Update Image Cache" is enabled
  - Preserves existing cache data during automatic updates

- **Folder Count Display:** Fixed completion message to show accurate number of scanned folders
  - Added `totalFoldersScanned` property to track actual non-ignored directory count
  - Completion messages now display correct folder count instead of only folders containing files

### Changed
- **Debug Logging Cleanup:** Converted internal progress and processing messages to debug-only mode
  - Reduced console noise during normal operation
  - Critical errors and user-facing messages remain visible
  - Improved debugging experience with properly flagged messages


## [12.1.10] - Character Import System and Enhanced Cache Size Monitoring

### Added
- **Character Import System:** Added comprehensive character import system with advanced properties:
  - Character type configuration (npc, player, monster)
  - Currency configuration with type and amount
  - Feature configuration with name and description
  - Spell configuration with name and description

### Added
- **Enhanced Cache Size Monitoring:** Added automatic size monitoring with warnings when cache approaches localStorage limits (8MB threshold)
  - Automatic fallback logic: File → localStorage quick cache → old localStorage format → rebuild
  - Cache directory auto-creation and management
  - Seamless migration from old localStorage-only format to hybrid system

### Fixed
- **CRITICAL: Token Image Cache System:** Fixed multiple critical bugs causing cache data loss and scan failures:
  - Error handling now saves partial cache with proper fingerprint even when scans fail
  - Incremental updates properly handle null/invalid fingerprints instead of infinite rescan loops
  - Finally block ensures cache status updates and UI renders correctly after errors
  - Enhanced fingerprint validation detects and handles `null`, `'error'`, and `'no-path'` states gracefully
  - Added comprehensive error logging with stack traces, cache diagnostics, and storage quota details
  - Cache now persists reliably even when scan errors occur, preventing loss of incremental progress
  - Enhanced localStorage cache with size monitoring and quota exceeded protection
  - Cache survives browser cache clearing and module updates

## [12.1.9] - Menu Bar System and Enhanced Consumable Item Import System

### Added
- **Menu Bar System:** Introduced a comprehensive menu bar for quick access to module features:
  - Current combatant display with portrait, name, HP, and conditions
  - Party leader display with initiative and status
  - Quick access buttons for frequently used tools
  - Configurable visibility and position settings
  - Real-time updates during combat
- **Simplified Item Import Options:** Streamlined item import dropdown to two clean options: "Loot" and "Consumables"
- **Enhanced Consumable Item Support:** Added comprehensive consumable item import with advanced properties:
  - Consumable type configuration (ammunition, food, poison, potion, rod, scroll, trinket, wand)
  - Magical property detection and attunement requirements
  - Usage tracking with spent/max uses and auto-destroy behavior
  - Recovery system with configurable periods (Long Rest, Short Rest, Day, etc.)
- **Activity System Integration:** Implemented full activity support for consumable items:
  - Multiple activities per item (Heal, Attack, Cast, Check, Damage, etc.)
  - Activity-specific effect configuration with dice formulas
  - Chat flavor text for activity descriptions
  - Proper FoundryVTT activity data structure with unique IDs
- **RollTable Import Utility:** Added comprehensive rolltable import system with multiple result types:
  - Text results with descriptions and weights
  - Document results linking to world actors/items with automatic matching
  - Compendium results with collection references
  - Support for "Draw with Replacement" and "Display Roll Formula" settings
- **Dynamic Prompt Generation:** Enhanced prompt templates with placeholder replacement:
  - Campaign name and rulebooks integration across all prompts
  - Dynamic actor lists for "Document: Actor" rolltables
  - Dynamic item lists for "Document: Item" rolltables
  - Automatic placeholder substitution during template copying

### Fixed
- **Consumable Property Mapping:** Fixed magical property detection using correct FoundryVTT field names (`properties.mgc`)
- **Activity Effect Configuration:** Resolved healing effect field mapping to use proper HTML field names:
  - `healing.number` for dice count
  - `healing.denomination` for die type (converted from "d8" to "8")
  - `healing.bonus` for bonus values
  - `healing.types` for effect type selection
- **Recovery System Validation:** Fixed recovery formula validation errors by using numeric values instead of text descriptions
- **RollTable Document Type Assignment:** Corrected document type assignment for rolltable results using proper field names (`documentCollection`)
- **Activity ID Generation:** Fixed activity ID format to meet FoundryVTT's 16-character alphanumeric requirements

### Changed
- **Unified Prompt Structure:** Consolidated item prompts to include both JSON and image generation instructions in single files
- **Enhanced Field Support:** Expanded consumable item fields to support all FoundryVTT consumable properties:
  - `consumableType`, `consumptionMagical`, `magicalAttunementRequired`
  - `limitedUsesSpent`, `limitedUsesMax`, `destroyOnEmpty`
  - `recoveryPeriod`, `recoveryAmount` (auto-calculated)
- **Improved Error Handling:** Enhanced validation and error handling throughout the import system
- **Scalable Activity Architecture:** Designed activity system to support multiple activity types with proper effect configuration

### Technical Details
- Updated `parseFlatItemToFoundry()` function with comprehensive consumable item support
- Implemented `parseTableToFoundry()` function for rolltable data conversion
- Added helper functions for world actor/item list generation
- Enhanced placeholder replacement system with `getTablePromptWithDefaults()`
- Fixed FoundryVTT data structure compliance for all imported item types


## [12.1.8] - Beginning of migration to version 13

### New
- **Modified Compatability**: Mod now on track to support FoundryVTT version 13

## [12.1.7] - XP Distribution System Complete Overhaul

### Added
- **Dual-Mode XP System:** Implemented independent Experience Points and Milestones modes
  - Experience Points mode: Monster-based XP calculation with resolution types
  - Milestones mode: Manual XP input with category, title, and description fields
  - Both modes can be active simultaneously with combined XP totals
  - Toggle controls for each mode with proper UI visibility management
- **Menubar Integration:** Added XP Distribution tool to GM Tools section of menubar
  - Accessible via "GM Tools" → "XP Distribution" button
  - Works independently of combat tracker - no active combat required
  - Integrates with existing menubar API and tool registration system
  - Maintains consistent UI/UX with other menubar tools
- **Non-Combat XP Distribution:** Added XP distribution window accessible from GM Tools menubar
  - Works without active combat by loading all canvas monsters
  - Defaults to "Removed" status for all monsters in non-combat mode
  - Maintains full monster data for dynamic resolution changes
  - Defaults to Milestones mode ON, Experience Points mode OFF when no combat active
- **Enhanced Monster Resolution System:** Expanded resolution types with proper multipliers
  - Defeated (1.00x), Escaped (0.60x), Captured (1.20x), Negotiated (1.50x), Ignored (0.20x), Removed (0.00x)
  - Visual resolution icons with tooltips and multiplier display
  - Real-time XP calculation updates as resolutions change
- **Player Adjustment Controls:** Added intuitive plus/minus buttons for individual player XP adjustments
  - Visual +/- buttons replace confusing input-only system
  - Error trapping prevents negative XP (rounds to 0)
  - Maintains existing player inclusion/exclusion functionality
- **Sticky Footer Layout:** Implemented proper flexbox layout for XP distribution window
  - Sticky header, scrollable middle content, sticky footer
  - Action buttons always visible at bottom regardless of window size
  - Responsive design that works at any window height

### Fixed
- **XP Calculation Discrepancies:** Resolved circular dependency bug in XP calculations
  - Fixed stale data issues where monster resolution changes didn't update totals
  - Unified player data loading between combat and non-combat modes
  - Ensured consistent XP calculations across all entry points
- **Character HP Corruption:** Fixed critical bug causing character death after XP distribution
  - Removed problematic `diff: false` and `recursive: false` flags from actor updates
  - Prevented infinite reactivity loops in FoundryVTT's actor update system
  - Characters now maintain proper HP values after XP distribution and browser refresh
- **Player Level Display:** Fixed missing player levels in combat mode
  - Unified player data structure between combat and non-combat entry points
  - Ensured consistent level information display across all modes
- **Monster Base XP Calculation:** Fixed CR-to-XP conversion for fractional challenge ratings
  - Converted CR table to use decimal keys (0.5, 1.5, etc.) instead of string keys
  - Added proper CR conversion helper for accurate XP calculations
  - Fixed "CR 0.5 monsters showing 0 XP" issue
- **Chat Card Display Logic:** Enhanced XP distribution results chat card
  - Filters out "REMOVED" monsters from display
  - Conditionally shows Experience Points and Milestones sections based on enabled modes
  - Fixed "LEVEL UP!" display for players with negative `nextLevelXp`
  - Shows total XP and XP to next level instead of just XP gained
- **Milestone Data Persistence:** Fixed milestone form data not appearing in chat card
  - Properly collects category, title, and description from form inputs
  - Uses direct jQuery `.val()` access instead of FormData (no form tag in template)
  - Ensures milestone data is captured before XP distribution

### Improved
- **UI/UX Consistency:** Standardized styling and layout across XP distribution interface
  - Consistent label styling with `class="label"` for all form elements
  - Side-by-side layout for milestone Experience Points input and Category select
  - Proper spacing and alignment for all form elements
  - Unified CSS targeting with data attributes instead of class-based selectors
- **Error Handling:** Enhanced robustness throughout XP distribution system
  - Added comprehensive error trapping for negative XP values
  - Improved actor update error handling with proper try-catch blocks
  - Added validation for player data before processing
  - Graceful handling of missing or invalid actor references
- **Performance Optimization:** Streamlined XP calculation and update processes
  - Removed unnecessary re-rendering on mode toggle changes
  - Implemented efficient jQuery show/hide instead of full template re-rendering
  - Optimized event handling to prevent duplicate calculations
  - Reduced console logging overhead in production

### Technical Improvements
- **Code Architecture:** Refactored XP distribution system for maintainability
  - Centralized XP calculation logic in `updateXpCalculations()` method
  - Unified player data loading with `loadPartyMembers()` static method
  - Separated concerns between data collection, calculation, and display
  - Improved method organization and reduced code duplication
- **Data Structure Consistency:** Standardized XP data object structure
  - Consistent player data format across combat and non-combat modes
  - Proper initialization of milestone data structure
  - Unified monster data format with all required fields
  - Eliminated data structure mismatches between different entry points


## [12.1.6] - Token Image Replacement System Enhancements

### Added
- **Favorites System:** Added comprehensive favorites functionality for token images
  - New "Favorites" filter tab in the category filters (left of "Selected")
  - Right-click any image thumbnail to favorite/unfavorite it
  - Favorites are stored persistently in the image cache metadata
  - Favorites filter shows only favorited images plus original/current image cards when token is selected
- **Visual Favorites Indicators:** Added heart icon badges for favorited images
  - Red heart icon appears in top-left corner of favorited image thumbnails
  - Clean design without background circle, matching other UI favorites styling
  - Heart icon has dark shadow for visibility against light backgrounds

### Fixed
- **Cache Completion Notifications:** Fixed multiple issues with cache scanning completion
  - "Delay Cache" button now properly changes back to "Scan for Images" when scan completes
  - In-window notification now shows completion status instead of scanning status
  - Added detailed completion data showing files found, folders scanned, and scan duration
  - Fixed incremental scans not completing gracefully in the UI
- **Progress Bar Issues:** Fixed "Phase 5 of 6" progress bar anomaly for large directories
  - Removed phantom 6th step that was causing progress bar to get stuck
  - Added progress validation to ensure completion state is properly triggered
  - Added timeout protection (3 hours) for long-running scans to prevent indefinite hanging
- **Player Character Support:** Fixed window dimming issue when selecting player characters
  - Added proper error handling to hide search spinner overlay on token selection errors
  - Enhanced token data extraction to handle player character data structure
  - Added type checking for potentially undefined properties before calling string methods
  - Player characters now default to 'humanoid' creature type, use race/ancestry for subtype, class for background, and 'medium' size
- **Original Image Preservation:** Fixed original image storage when applying images from the window
  - Original token image is now saved before applying new image (only if original doesn't already exist)
  - Maintains consistency with drop-to-apply behavior
  - Ensures original image can always be restored

### Improved
- **Cache Management:** Enhanced cache scanning with better error handling and completion detection
  - Added completion state tracking with `justCompleted` and `completionData` fields
  - Improved UI state management to prevent race conditions between scanning and completion
  - Added safety mechanisms for long-running operations
- **Token Data Extraction:** Improved robustness of token data parsing
  - Added comprehensive type checking for all string operations
  - Better handling of different actor data structures (NPCs vs Player Characters)
  - More reliable search term generation for better image matching
- **Favorites Integration:** Seamlessly integrated favorites with existing tag system
  - Favorites use the existing metadata tag system for consistency
  - Favorites filter works like other category filters (not as a hack)
  - Original and current image cards always show when token is selected, regardless of filter

### Technical Details
- Updated `scripts/token-image-replacement.js` with comprehensive favorites functionality
- Enhanced `templates/window-token-replacement.hbs` with favorites filter button
- Updated `styles/window-token-replacement.css` with clean favorites styling
- Fixed case sensitivity issues in cache file lookups (files stored with lowercase keys)
- Improved error handling and debugging throughout the image replacement system


## [12.1.5] - Token Movement System Enhancements

### Fixed
- **Token Movement Locking:** Fixed critical issue where players could still move tokens even when movement was set to "locked" mode
- **HookManager Return Value Handling:** Modified HookManager to properly handle return values from `preUpdateToken` hooks, allowing movement restrictions to actually block token updates
- **Movement Restriction Enforcement:** Players now receive warning messages AND movement is properly blocked when in "no-movement" mode

### Technical Details
- Updated `scripts/manager-hooks.js` to capture and respect return values from `preUpdateToken` hook callbacks
- When any `preUpdateToken` callback returns `false`, the entire hook chain now returns `false` to block the action
- This ensures FoundryVTT properly respects movement restriction settings

### TODO
- **HookManager Priority System:** Consider implementing proper priority-based execution order for hook callbacks (currently hooks run in registration order, not priority order)
- **Comprehensive Hook Testing:** Test all hook types to ensure the return value handling doesn't break other functionality


## [12.1.4] - Token Image Replacement System Enhancements

### Added
- **Original Image Tracking:** Tokens now store their original image when first dropped, allowing users to revert to the initial image
- **Original Image Card:** Added "Original Image" card as the first result in the Token Image Replacement window with purple styling
- **Double-Middle-Click Support:** Double-middle-click on any token to instantly open the Token Image Replacement window with that token selected
- **Update Dropped Tokens Setting:** New world setting to control whether tokens are automatically updated when dropped on the canvas
- **Fuzzy Search Toggle:** New toggle for manual search box input - when enabled, searches for individual words independently
- **Threshold Display Enhancement:** Moved threshold percentage from slider to label for better readability (e.g., "Matching Threshold 32%")
- **Current Image Tag:** Added "CURRENT IMAGE" tag to clearly identify the currently selected token's image

### Fixed
- **Duplicate Object Key:** Removed duplicate "kobold" entry from monster-mapping.json that was causing JSON parsing errors
- **Selected Token Card Visibility:** Fixed issue where selected token card would disappear when relevance score was below threshold
- **Current Image Tag Display:** Fixed "CURRENT IMAGE" tag not appearing consistently for selected tokens
- **Scoring Algorithm:** Improved relevance scoring calculation for more accurate image matching (Brown Bear now scores 55%+ instead of 15%)
- **Results Blanking:** Fixed window results being cleared after applying an image to a token - now properly refreshes
- **Fuzzy Search Scope:** Corrected fuzzy search to only apply to manual search box input, not automatic token matching
- **Original Image Persistence:** Fixed original image data to be stored in token flags for persistence across sessions
- **Memory Leaks:** Fixed potential memory leaks with proper event listener cleanup and HookManager usage
- **TypeError in Token Context:** Fixed TypeError when metadata fields are not strings in `_calculateTokenContextBonus`

### Changed
- **Image Application Flow:** After applying an image, the window now closes for a cleaner user experience
- **Token Selection Detection:** Added global token selection hook to detect token changes system-wide
- **Scoring System:** Restored user-configurable weights for more accurate and customizable scoring
- **Debug Logging:** Removed excessive debug logging that was slowing down search performance
- **Window Refresh Logic:** Simplified window refresh to use the same code path as the toolbar button

### Technical Details
- Implemented `_storeOriginalImage()` and `_getOriginalImage()` methods using token flags for persistence
- Added `_addMiddleClickHandler()` with proper cleanup via `_removeMiddleClickHandler()`
- Enhanced `_sortResults()` to prioritize original images first, then current images
- Updated `_applyImageToToken()` to close window after successful image application
- Fixed `_getTagsForMatch()` to handle original images without metadata
- Improved `_calculateRelevanceScore()` with better maxPossibleScore calculation
- Added proper memory management with HookManager integration


## [12.1.3] - NEW Token Image Replacement System

### Added
- **Token Image Replacement System:** Complete token image replacement functionality with automatic matching and manual selection
- **Dual Use Case Support:** Separate logic for automatic replacement (best match) vs manual selection (all matches)
- **Token Image Replacement Window:** Dedicated UI window for GMs to manually select token images from available alternatives
- **Cache Management System:** Comprehensive image caching with incremental updates, pause/resume, and storage persistence
- **CoffeePub Toolbar Integration:** Added Token Image Replacement button to CoffeePub toolbar for easy access
- **Progress Tracking:** Real-time progress bars showing scan status with detailed folder and file information
- **Smart Cache Updates:** Incremental update system that only rescans when folder structure changes
- **Confirmation Dialogs:** User-friendly dialogs for scan type selection (Incremental Update vs Full Rescan vs Cancel)
- **Token Selection Detection:** Automatic detection of currently selected tokens when window opens
- **Multiple Match Display:** Shows up to 11 alternative images plus current image (12 total) in thumbnail grid
- **Current Image Highlighting:** Green checkmark and border to identify the currently assigned token image

### Fixed
- **Cache Age Calculation:** Fixed incorrect cache age display (was showing 488,232 hours instead of reasonable values)
- **Cache Persistence:** Resolved cache being cleared on every client reload
- **SUPPORTED_FORMATS Context:** Fixed undefined errors in folder fingerprinting and file processing
- **Search Threshold:** Lowered matching threshold from 0.5 to 0.3 for better match detection
- **Multiple Match Display:** Fixed window showing only 1 match instead of all available alternatives
- **Infinite Render Loop:** Prevented Foundry crashes caused by render loop issues
- **Automatic Scanning Bypass:** Fixed scans starting even when auto-update setting was disabled
- **FilePicker Scope:** Corrected FilePicker.browse calls to use 'data' instead of 'public' scope
- **Incremental Cache Processing:** Ensured files are added to cache immediately during scanning
- **Token Selection Hook:** Fixed token selection not working when window opens with token selected

### Changed
- **Cache Management:** Replaced confusing cache settings with single "Automatically update image cache" checkbox
- **Dialog Buttons:** Updated scan confirmation dialog with proper button labels (Incremental Update, Full Rescan, Cancel)
- **Search Algorithm:** Enhanced matching algorithm to find multiple alternatives for manual selection
- **Progress Display:** Improved progress bar text with detailed folder paths and file counts
- **Cache Storage:** Implemented incremental saves during long scans to prevent data loss
- **Error Handling:** Enhanced error handling with detailed logging and user notifications

### Technical Details
- Implemented `TokenImageReplacement` class with comprehensive cache management
- Added `TokenImageReplacementWindow` for manual token image selection
- Created `_doIncrementalUpdate()` method for efficient cache updates
- Enhanced `_findMatches()` method to display all alternatives for manual selection
- Fixed `_saveCacheToStorage()` to handle incremental saves properly
- Updated `_generateFolderFingerprint()` to use correct FilePicker scope
- Implemented proper hook registration/unregistration for token selection
- Added comprehensive debugging and logging throughout the system

## [12.1.2] - NEW Toolbar Manager

### Added
- **Dynamic Toolbar System:** Implemented comprehensive toolbar management system with dynamic tool registration and zone-based organization
- **Zone System:** Added 6 predefined zones (general, rolls, communication, utilities, leadertools, gmtools) for logical tool grouping and visual organization
- **Three-Tier Visibility System:** Implemented GM/Leader/Player visibility controls with proper permission checking
- **Token Toolbar Integration:** Added Request Roll tool to Foundry's default token control toolbar alongside existing tools
- **Toolbar Settings:** Added client-side settings for toolbar dividers and labels with proper scope management
- **Leader System Integration:** Integrated party leader detection with toolbar visibility and vote system
- **CSS Zone Styling:** Added `toolbar-zones.css` with zone-specific background colors and visual dividers
- **Toolbar Refresh Logic:** Implemented automatic toolbar refresh when party leader changes or settings update
- **External Module API:** Exposed comprehensive toolbar API for external modules to register custom tools
- **Utility Function Exposure:** Added 11 utility functions to API (getActorId, getTokenImage, getPortraitImage, getTokenId, trimString, toSentenceCase, objectToString, stringToObject, convertSecondsToRounds, convertSecondsToString, clamp)
- **OpenAI API Separation:** Refactored OpenAI functionality into dedicated `api-openai.js` with improved error handling and validation
- **Model Support Update:** Added support for latest OpenAI models (GPT-5, GPT-4o, GPT-4o-mini, O1 models) with updated pricing calculations
- **Session Memory System:** Implemented persistent conversation memory with session-based context management for AI interactions
- **Persistent Storage:** Added localStorage-based memory persistence that survives page refreshes and FoundryVTT restarts
- **OpenAI Projects Support:** Added optional OpenAI Projects integration for better cost tracking and team management
- **API Documentation:** Created complete API documentation with examples for all exposed functions

### Changed
- **Consolidated Architecture:** Merged separate `BlacksmithToolbarManager` class into `manager-toolbar.js` for simplified management
- **Tool Registration:** Migrated from hardcoded tool arrays to dynamic `Map`-based registration system
- **Vote System Integration:** Updated vote manager to use consistent leader detection logic across all systems
- **Leader Detection:** Improved party leader detection with timing safeguards and setting availability checks
- **Toolbar Hooks:** Enhanced `getSceneControlButtons` hook to support both Blacksmith and Foundry toolbars

### Fixed
- **Visibility Logic Bug:** Fixed `else if` structure in token toolbar visibility checking to prevent overrides
- **Leader Timing Issues:** Resolved party leader detection timing problems during initial load
- **Vote Permissions:** Fixed vote system to allow leaders to start regular votes (not leader votes)
- **Toolbar Refresh:** Added delayed refresh mechanism to ensure settings are loaded before toolbar rendering
- **Duplicate Prevention:** Added checks to prevent duplicate tools in token toolbar
- **Setting Registration:** Fixed toolbar settings registration timing and scope issues

### Technical Details
- **Tool Data Structure:** Enhanced tool objects with `zone`, `order`, `gmOnly`, `leaderOnly` properties
- **Hook Management:** Added `settingChange` hook for automatic toolbar refresh on leader changes
- **Error Handling:** Improved error handling for missing settings and invalid tool registrations
- **Performance:** Optimized tool lookup and rendering with efficient Map-based storage
- **Documentation:** Updated `architecture-toolbarmanager.md` with complete implementation details


## [12.1.1] - BREAKING PATCH

### Fixed
- **Missing Files:** forgot to add some files to the release.

## [12.1.0] - MAJOR UPDATE - Blacksmith API Migration

### Added
- **Module-Specific Release Naming:** Updated release workflow to create `coffee-pub-blacksmith.zip` instead of generic `module.zip` for better module identification and management.
- **Unified Header System:** Created `partial-unified-header.hbs` template for consistent header styling across skill check dialog and roll window
- **Actor Portrait Support:** Added actor portrait display in roll window header next to actor name
- **Real-Time Formula Updates:** Added live formula updates when situational bonus or custom modifier changes, with blue text highlighting modifications
- **Roll Mode Visibility System:** Implemented comprehensive roll mode handling (Public, Private GM, Blind GM, Self Roll) with proper visibility controls in chat cards
- **Ownership-Based Controls:** Added ownership checks for roll buttons, disabling non-owner interactions with visual feedback
- **Chat Scrolling:** Added automatic chat scrolling to bottom when roll results are updated
- **Roll Request Sound:** Added sound notification when roll requests are posted to chat
- **Schema-Driven Roll Architecture:** Designed complete D&D 5e roll rules system with:
  - `dnd5e-roll-rules.js` - Pure JavaScript export of D&D 5e mechanics schema
  - `rules-service.js` - Singleton service for rule management, feature detection, and caching
  - `resolve-check-pipeline.js` - Ability check resolution with JOAT, Remarkable Athlete, and Reliable Talent
  - `resolve-save-pipeline.js` - Saving throw resolution with exhaustion, conditions, and cover
  - `resolve-attack-pipeline.js` - Attack roll and damage resolution with critical hits and fumbles
- **Comprehensive Documentation:** Updated `ARCHITECTURE-ROLLS.md` with complete schema-driven system design and implementation details

### Changed
- **Download URL Pattern:** Changed download URL from version-specific (`v12.1.0/module.zip`) to latest release pattern (`latest/coffee-pub-blacksmith.zip`), eliminating the need for manual URL updates before each release.
- **Release Workflow:** Updated GitHub Actions workflow to use module-specific zip naming and file references.
- **Roll Window Integration:** Updated roll window to use unified header template and pass actor portrait data
- **Formula Display Logic:** Enhanced formula display to show ability-specific modifiers instead of hardcoded "dex"
- **Custom Modifier Processing:** Improved custom modifier parsing to handle multiple values and prevent double plus signs
- **Roll Title Handling:** Fixed roll title passing from skill check dialog to roll window and chat cards
- **Template Structure:** Updated skill check and roll window templates to use consistent header layout and styling
- **Roll Calculation Accuracy:** Enhanced roll calculations to ensure 100% accuracy between displayed formula and actual roll execution

### Fixed
- **Manual Release Process:** Eliminated the requirement to manually update the download URL in `module.json` before each release. The `latest` tag now automatically redirects to the most recent release.
- **Hardcoded Ability References:** Fixed formula display to use dynamic ability keys instead of hardcoded "dex"
- **Custom Modifier Parsing:** Fixed double plus signs in custom modifier tooltips and formula display
- **Proficiency Calculation:** Fixed ability rolls to properly include proficiency bonus when character is proficient
- **Roll Title Consistency:** Fixed roll title display across skill check dialog, roll window, and chat cards
- **Chat Card Ownership:** Fixed ownership-based button functionality in chat cards
- **Template Rendering:** Fixed partial template loading errors and missing data passing
- **Math Accuracy:** Fixed roll calculation discrepancies between displayed formula and actual roll execution
- **Group Roll Logic:** Fixed group roll evaluation to properly honor the Group DC toggle setting
- **Roll Mode Processing:** Fixed roll mode selection to be properly passed through to roll execution

### Technical Details
- Implemented component-based roll evaluation system for accurate D&D 5e rule compliance
- Added feature detection from actor items and active effects for proficiency resolution
- Created caching system for rules and feature indexes to improve performance
- Enhanced error handling and validation throughout the roll system
- Improved socket communication for roll mode visibility and ownership controls
- Added comprehensive logging and debugging capabilities for roll system troubleshooting

## [12.0.23] - Suppress Combat Deployment from Players

### Fixed
- **Player Deployment Panel Access:** Fixed issue where the deployment panel (CODEX) was visible to players in journal entries. The entire deployment interface is now restricted to GMs only.
- **Deployment Panel Security:** Wrapped the complete deployment section in GM permission checks, preventing players from seeing:
  - DEPLOY section with deployment pattern and visibility settings
  - "Nothing to Deploy" messages
  - Deployment action buttons and monster/NPC icons
  - Deployment controls and settings
- **Canvas Information Visibility:** Maintained visibility of canvas information (Party CR, Monster CR, encounter difficulty) for all users while restricting deployment functionality to GMs only.

### Changed
- **Template Structure:** Restructured `encounter-toolbar.hbs` template to wrap the entire deployment interface in `{{#if isGM}}` conditional blocks.
- **Permission Enforcement:** Consolidated individual GM permission checks into comprehensive section-level protection for better security and maintainability.

## [12.0.22] - Quick Fix

### Fixed
- **Manifest:** Corrected the manifest download.

## [12.0.21] - Token Grid Positioning Fix

### Fixed
- **Token Grid Positioning:** Fixed token deployment to properly snap to grid square positions instead of grid intersections. All deployment patterns (line, circle, scatter, grid, sequential) now correctly place tokens within grid squares using the proper FoundryVTT coordinate system.

### Changed
- **Skill Roll Routing (DnD5e 4.4.4):** Updated skill check execution to use the DnD5e Actions API first (`game.dnd5e.actions.rollSkill`), with safe fallbacks to `rollSkillV2` and `doRollSkill`, and legacy `rollSkill` only as a last resort. This ensures v2 paths are used on 4.4.4 and prepares for removal of deprecated hooks in 5.0.

### Compatibility
- **Deprecation Warning Mitigation:** On DnD5e 4.4.4, skill checks now route through the v2 API to avoid triggering the deprecated `dnd5e.rollSkill` hook warning.

## [12.0.20] - Encounter Toolbar and Token Deployment

### NOTE: Bumped the version to 12 to align with the Foundry version.

### Added
- **Encounter Folder Support:** Added support for placing deployed actors in a configurable folder. When the `encounterFolder` setting is specified, actors are automatically placed in that folder. If the folder doesn't exist, it's created automatically. If the setting is empty, actors are placed in the root directory.
- **Enhanced Token Deployment Patterns:** Implemented multiple deployment patterns for encounter tokens:
  - **Circle Formation:** Tokens are placed in a circle around the deployment point
  - **Scatter Positioning:** Tokens are scattered in a spiral pattern to prevent overlaps with random variation
  - **Grid Positioning:** Tokens are placed in a proper square grid formation using scene grid size
  - **Sequential Positioning:** Tokens are placed one at a time with user guidance via tooltip
  - **Line Formation:** Default fallback pattern for backward compatibility
- **Unlinked Token Creation:** Deployed tokens are now created as unlinked copies instead of linked tokens, providing better flexibility for individual token management.
- **Lock Rotation Support:** Deployed tokens now honor the GM's default token rotation settings from Foundry core settings.
- **CR Badge System:** Added Party CR and Monster CR badges to the encounter toolbar:
  - **Party CR:** Calculates weighted party level using tiered formula (levels 1-4: 0.25x, 5-10: 0.5x, 11-16: 0.75x, 17-20: 1x)
  - **Monster CR:** Shows total CR of monsters currently deployed on the canvas
  - **Difficulty Badge:** Displays encounter difficulty with proper color coding
- **Encounter Template Import:** Added "Encounter" option to the JSON import dropdown, allowing users to copy encounter templates from `prompt-encounter.txt` for easy encounter creation.
- **Content Scanning:** Enhanced encounter detection to scan journal content for encounter data in JSON, markdown, and plain text formats when structured data attributes are not found.
- **Foundry UUID Support:** Updated content scanning to properly parse Foundry's @UUID[...]{...} format for monster references in journal entries.
- **Monster Name Resolution:** Added support for monster names in templates (e.g., "Death Knight", "Helmed Horror") with automatic lookup in available compendiums during deployment.
- **Pattern-Based Detection:** Completely redesigned encounter detection to use robust pattern matching instead of section-based parsing. Now detects @UUID patterns anywhere on the page, validates Actor types, and supports quantity indicators (x3, (3), etc.).
- **Journal Type Identification:** Maintains support for `data-journal-type="encounter"` as a quick identifier while ignoring deprecated `data-encounter-monsters` and `data-encounter-difficulty` attributes in favor of content scanning.
- **Monster Portraits:** Added monster portraits to the encounter toolbar instead of generic dragon icons, showing actual monster images with proper CR values.
- **Enhanced Retry Mechanism:** Improved content scanning reliability with multiple retry attempts (500ms, 1000ms, 2000ms) to handle timing issues when journal content loads after toolbar initialization.
- **Real-Time CR Updates:** Added real-time CR calculation updates when tokens are created, updated, or deleted on the canvas. CR badges now update automatically without requiring journal refresh.
- **Individual Token Deployment:** Added ability to deploy individual monsters and NPCs by clicking on their icons in the toolbar. Supports both single deployment and CTRL-click for multiple placement.
- **Multi-Placement Support:** Implemented CTRL key functionality for placing multiple instances of single tokens. Hold CTRL while clicking to place multiple copies, release CTRL to finish.
- **Invisible Token Deployment:** Added ALT key functionality to deploy tokens as invisible. Hold ALT while deploying to create hidden tokens for surprise encounters.
- **Token Visibility Toggle:** Added "Reveal Monsters" button to make hidden hostile NPC tokens visible on the canvas.
- **NPC and Monster Separation:** Separated NPCs and monsters into distinct sections in the toolbar display, with proper classification based on compendium source and disposition.
- **Deployment Cancellation:** Added right-click to cancel deployment during placement, with proper cleanup of event handlers and tooltips.
- **Partial Deployment Handling:** Added dialog prompt when combat creation is cancelled mid-deployment, allowing users to choose whether to create combat with partially deployed tokens.

### Fixed
- **Token Display Name Settings:** Fixed deployed tokens to honor the GM's core token display settings instead of prototype token settings. Tokens now properly use the GM's default name display mode (e.g., "anyone on hover" vs "never").
- **Actor Prototype Token Updates:** Fixed actor prototype tokens to be updated with GM's default settings when created from compendiums, ensuring subsequent drags from the actor tab also honor GM defaults.
- **Scatter Pattern Overlaps:** Fixed scatter deployment pattern to prevent token overlaps by using a spiral-based distribution with adequate spacing.
- **Grid Formation Issues:** Fixed grid deployment pattern to create proper square formations instead of single lines, using actual scene grid size for positioning.
- **Memory Leaks:** Fixed memory leaks in event handlers and socket communications to improve performance and prevent memory accumulation over time.
- **Debug Logging:** Optimized debug logging to reduce console noise and improve performance by using proper logging levels and conditional debugging.
- **Combat Token Addition:** Fixed issue where deployed tokens were not being added to combat encounters. Now properly tracks deployed tokens and adds them to existing or new combat encounters.
- **Double Deployment Issue:** Fixed issue where clicking "create-combat" button would deploy tokens twice. Consolidated deployment logic into single function used by both buttons.
- **Spell DC Deprecation Warning:** Updated CR calculation to use new DnD5e 4.3+ spell DC property path (`attributes.spell.dc`) with backward compatibility.
- **Encounter Template Placeholders:** Fixed encounter template copying to replace placeholders with settings values (campaign name, party details, etc.) like narratives do.
- **Encounter Settings:** Added new encounter default settings for folder and card image configuration.
- **Compendium Search Expansion:** Updated compendium search functions to support up to 8 monster and item compendiums (increased from 5).
- **Difficulty Badge Alignment:** Fixed "MEDIUM" difficulty badge to be left-aligned with the title instead of centered.
- **Party CR and Monster CR Display:** Ensured Party CR and Monster CR are always calculated and displayed, even when no explicit encounter data is found in the journal.
- **Permission Errors:** Fixed permission errors when players try to use features that require token updates (deployment, combat creation, token conversion, movement, token renaming). Added proper GM-only permission checks.
- **Multiple Journal Windows:** Fixed issue where having multiple journal windows open would cause multiple deployments and combat creations when clicking buttons. Event listeners are now properly scoped to individual toolbars.
- **Broken Monster Links:** Added logic to skip broken monster links (e.g., `class="content-link broken"`) during encounter detection.
- **CR Values Display:** Fixed CR values to display correct values instead of all 0s by implementing robust CR extraction from multiple actor system paths.
- **CR Badge Icon Removal:** Fixed issue where CR badge icons were being removed when updating CR values. Now preserves icons during updates.
- **ESC Key Cancellation:** Fixed ESC key functionality to properly cancel deployment without causing errors. Replaced with right-click cancellation for better user experience.
- **Sequential Deployment Cancellation:** Fixed error when cancelling sequential deployment that would cause "Cannot read properties of null" error. Added proper null checks for cancelled deployments.
- **Token Linking Honor:** Fixed hardcoded `actorLink = false` to honor the original actor's prototype token linked setting during deployment.
- **NPC Deployment Issues:** Fixed NPCs not being deployed and appearing in monster sections. Added proper NPC/monster classification and separate deployment handling.
- **Index Mismatch Errors:** Fixed issue where clicking on one monster icon would deploy a different monster due to DOM index mismatches. Now uses UUID-based identification.
- **UUID Validation:** Fixed UUID validation to properly handle world actors (non-compendium actors) during deployment.

### Changed
- **Deployment Pattern Setting:** Added `encounterToolbarDeploymentPattern` setting with options for circle, line, scatter, grid, and sequential positioning.
- **Deployment Hidden Setting:** Added `encounterToolbarDeploymentHidden` setting to control whether deployed tokens are hidden by default.
- **Real-Time Update Setting:** Added `enableEncounterToolbarRealTimeUpdates` setting to control whether CR badges update automatically when tokens change on the canvas.
- **Improved Token Positioning:** All deployment patterns now properly snap to the scene grid and use appropriate spacing based on grid size.
- **Enhanced Error Handling:** Added comprehensive error handling for folder creation and actor placement operations.
- **Toolbar Layout:** Redesigned encounter toolbar with title above buttons and badges, improved badge positioning and styling. Moved difficulty badge to canvas section for better organization.
- **Combat Creation Flow:** Updated "create-combat" button to deploy tokens first, then create combat with those tokens, ensuring proper token tracking.
- **Event Listener Scoping:** Updated event listeners to be properly scoped to individual toolbar containers, preventing cross-contamination between multiple journal windows.
- **Permission-Based UI:** Updated toolbar template to only show deployment and combat buttons for GMs, while still displaying monster icons and CR information to all users.
- **Deployment Controls:** Updated deployment controls to support CTRL for multiple placement and ALT for invisible deployment. Tooltips now show key combinations for user guidance.
- **Cancellation Method:** Changed deployment cancellation from ESC key to right-click to prevent interference with other open windows and dialogs.

### Technical Details
- Implemented proper merging of GM's `defaultToken` settings with actor prototype tokens using `foundry.utils.mergeObject`
- Added grid-aware positioning using `canvas.scene.grid.size` for accurate token placement
- Enhanced spiral-based scatter algorithm with random variation for natural-looking distributions
- Improved folder management with automatic creation and error recovery
- Added weighted party CR calculation using tiered level brackets for realistic encounter scaling
- Implemented canvas-based monster CR calculation for real-time encounter difficulty assessment
- Added permission checks to all token update operations: `_deployMonsters()`, `_createCombatWithTokens()`, `_createCombat()`, `_convertTokenToLoot()`, `_onCreateToken()`, `processNextFollower()`, `moveAllTokensOneStep()`
- Implemented proper event listener scoping using `toolbar.find()` instead of `$(document).find()` to prevent multiple journal window conflicts
- Added robust CR extraction from multiple actor system paths: `actor.system.details.cr.value`, `actor.system.details.cr`, `actor.system.cr`
- Enhanced content scanning with multiple fallback selectors and document-wide search for better reliability
- Implemented real-time CR updates using FoundryVTT hooks: `createToken`, `updateToken`, `deleteToken`, `settingChange`
- Added debouncing mechanism for CR updates to prevent performance issues during rapid token changes
- Implemented NPC/monster classification using heuristic-based logic (compendium source and disposition)
- Enhanced token deployment with key state detection (CTRL, ALT) and proper event handling for multiple placement modes
- Added UUID-based token identification to prevent DOM index mismatches during individual deployment
- Implemented proper token linking honor by preserving original actor's `prototypeToken.actorLink` setting

## [1.0.19] - Item Import and UI Improvements

### Added
- **Item Image Terms Array:** Added `itemImageTerms` array to item JSON for explicit control over image matching during imports, allowing precise synonym specification for image selection.
- **API Exposure:** Exposed `arrCOMPENDIUMCHOICES` in the Blacksmith API for other modules to access available compendium choices.

### Fixed
- **Item Import Logic:** Fixed image guessing logic to properly prioritize exact and partial synonym matches in item names first, then in descriptions, followed by loot type, filename, and fallback options.
- **Compendium Links:** Fixed compendium links during import to use UUIDs instead of simple references, ensuring links remain valid after import.
- **UI Underline Effects:** Removed underline effects and associated code from UI elements, relying on mouse pointer changes as sufficient visual cues.

### Changed
- **Image Matching Priority:** Improved item image matching to check `itemImageTerms` array first, then follow a clear hierarchy: item name exact/partial matches → description matches → loot type → filename → fallback options.

## [1.0.18] - Multiple Token Bug Fix

### Fixed
- **Token Name Display:** Skill check dialog and chat cards now use the token's name (e.g., "Sinolax (Troll)") instead of the actor's name (e.g., "Troll") for all contestant and result displays, making it easier to distinguish between multiple tokens of the same actor.
- **Multiple Token Roll Support:** Chat card roll buttons now correctly support rolling for multiple tokens of the same actor by matching both tokenId and actorId, ensuring each token instance is handled independently.
- **Improved User Clarity:** All skill check UI and chat card displays now reflect the actual token name, improving clarity for GMs and players when multiple similar tokens are present.
- **Token ID System:** Completely refactored skill check system to use token IDs instead of actor IDs for unique identification
- **Chat Card Roll Buttons:** Updated chat card roll buttons to work with individual token instances
- **Permission Handling:** Fixed permission checks to allow GMs to roll for any token while maintaining proper ownership checks for players
- **Actor Lookup:** Improved actor lookup logic with better error handling and debugging for token-to-actor resolution

### Changed
- **Data Structure:** Updated skill check message data to store both token ID (for unique identification) and actor ID (for roll operations)
- **Template Attributes:** Changed data attributes from `data-actor-id` to `data-token-id` for clarity
- **Socket Communication:** Updated socket handlers to work with token IDs for proper multi-token support

### Technical Details
- Changed `getData()` method to use `t.id` (token ID) instead of `t.actor.id` (actor ID)
- Updated all JavaScript methods to handle token ID to actor ID resolution
- Fixed chat card template to store both token and actor IDs
- Improved error handling for cases where tokens or actors might not be found

## [1.0.17] - Experience Points

### Added
- **XP Distribution Chat Card:** Introduced a new, visually distinct chat card to display XP distribution results, separate from the main XP window.
- **Dedicated CSS for XP Card:** Created a new stylesheet (`cards-xp.css`) and namespaced all classes to ensure consistent styling and prevent conflicts.

### Changed
- **XP Chat Card Layout:** Completely redesigned the chat card for improved clarity and aesthetics:
  - The **XP Summary** section now uses a clean, two-column layout.
  - The **Player Results** section has been updated to feature the character portrait, name, and new total XP on the left, with the XP gained aligned to the right.
  - The **Monster Resolutions** section now aligns all monster names and icons for a tidier list, with XP values aligned to the right.
- **Improved Data Formatting:** XP multipliers are now consistently formatted to two decimal places (e.g., 1.00) on all displays.

### Removed
- **Removed CR from Chat Card:** The monster Challenge Rating is no longer displayed on the XP chat card to reduce clutter.
- **Removed Legend from Chat Card:** The resolution types legend was removed from the chat card for a more streamlined look.

## [1.0.16] - Compendiums

### Added
- **Enhanced Compendium Mapping System**
  - Added support for up to 5 monster lookup compendiums (replacing the old primary/secondary system)
  - Added support for up to 5 item lookup compendiums
  - Added "Search World Items First" setting to prioritize world items over compendium items
  - Added automatic item linking in narrative JSON imports (similar to monster linking)
  - Added fuzzy matching for item names with exact match priority

### Changed
- **Improved Compendium Labels**
  - Updated compendium dropdown labels to show source and name (e.g., "Dungeons & Dragons 5th Edition: Actors")
  - Enhanced clarity when multiple compendiums share the same name
- **Enhanced Item Linking**
  - Items in rewards and other narrative fields are now automatically linked to compendium entries
  - Item linking follows the same priority system as monster linking (world first, then compendiums 1-5)
  - Improved item name matching with exact match priority over partial matches

### Fixed
- Removed legacy monster compendium primary/secondary settings
- Cleaned up unlinked item/monster display by removing "(Link Manually)" suffix
- Fixed item name matching to handle variations like "Bedroll (used for sleeping)" matching "Bedroll"

### Removed
- Removed old `monsterCompendiumPrimary` and `monsterCompendiumSecondary` settings
- Removed legacy compendium lookup code

## [1.0.15] - Optimizations

### Fixed
- Group roll summary (success/failure) now displays correctly after all players or the GM have rolled, regardless of who initiates the roll.
- Fixed issue where GM-initiated rolls did not update the chat card for all users.
- Prevented ReferenceError when requesting rolls (no roll performed yet).
- Fixed error when roll is not defined in the roll handler.
- Improved error handling and guard clauses to prevent undefined roll errors in all roll scenarios.

### Changed
- Updated all skill roll logic to use `rollSkillV2` if available, with fallback to `rollSkill` for backward compatibility with older DnD5e versions.
- Added robust compatibility checks for DnD5e 4.1+ and future 4.5+ removal of deprecated methods.
- Refactored socket and chat update logic for unified handling of both player and GM rolls.
- Improved code clarity and maintainability in skill check dialog and group roll logic.

### Compatibility
- Fully compatible with DnD5e 4.1+ and future-proofed for 4.5+ removal of deprecated APIs.
- No longer triggers deprecation warnings for skill rolls.

## [1.0.14] - 2025-04-28 - Excluded Users and Character Leadership

### Added
- Implemented character-based leadership system
- Added character name display in leader selection
- Updated movement system to follow character tokens
- Added player name display alongside character names

### Fixed
- Fixed excluded users appearing in leader selection dialog
- Fixed excluded users appearing in character vote options when using "Current Players" source
- Improved consistency of user exclusion across all voting and leader selection interfaces

### Changed
- Refactored skill check dialog and skill selection logic for improved reliability and maintainability
- Updated skill check integration to support direct result passing and input field updates
- Improved UI hiding logic for skill check and movement panels to reduce clutter when not in use
- Refactored and improved code for token following and conga line movement, ensuring smoother and more consistent pathing

## [1.0.13] - 2025-04-22 - Movement AND CLEANUP

### Added
- **Enhanced Movement System**
  - Added proper path management for conga line movement
  - Added token spacing configuration
  - Added status tracking for tokens (Normal, Blocked, Too Far)
  - Added visual indicators for token status in marching order
  - Added automatic exclusion of blocked or too-far tokens from movement

### Changed
- **Movement Improvements**
  - Improved path following behavior for tokens
  - Enhanced marching order calculation
  - Optimized path trimming logic
  - Better handling of token spacing in formation

### Fixed
- Fixed tokens stacking on top of each other during movement
- Fixed marching order recalculation issues
- Fixed path following to maintain proper spacing
- Fixed tokens skipping path points during movement
- Fixed blocked and too-far tokens attempting to join formation
- Fixed conga line movement bugs causing tokens to stack or lose formation
- Fixed follow mode issues where tokens would not properly follow the leader or would desync
- Fixed skill check dialog not updating input fields after roll
- Fixed UI elements not hiding correctly when toggled or when not relevant to the current mode

## [1.0.12] - 2025-03-25 - Rolls and Movement Controls

### Added
- **Skill Check System**
  - New skill check dialog for quick party-wide rolls
  - Support for contested rolls between groups
  - Customizable DC display and success/failure indicators
  - Quick roll context menu for common skill checks
  - Detailed roll results with formula display
  - Group success tracking for multiple participants
  - Skill descriptions and rule references

- **Movement Controls**
  - New movement configuration dialog
  - Multiple movement modes:
    - Normal movement
    - No movement
    - Combat movement
    - Follow movement
    - Conga line movement
  - Visual indicators for current movement mode
  - GM-only movement mode control
  - Persistent movement settings

- **Chat Card Improvements**
  - Enhanced skill check card layout
  - Better visual hierarchy for roll results
  - Improved success/failure indicators
  - Detailed roll information tooltips
  - Group vs group contest visualization
  - Stalemate detection and display
  - Party-wide roll success tracking

- **UI Enhancements**
  - New movement control icon in menubar
  - Quick access to skill check dialog
  - Improved chat card spacing and margins
  - Better visual feedback for roll results
  - Enhanced tooltips and information display
  - Streamlined interface for GM controls

### Changed
- Updated menubar layout to accommodate new features
- Improved error handling for settings access
- Enhanced leader selection interface
- Better synchronization of movement states
- Optimized performance for multiple simultaneous rolls

### Fixed
- Settings access error handling
- Leader selection synchronization
- Movement state persistence
- Chat card rendering issues
- Roll result calculation accuracy

## [1.0.11] - 2025-03-25 - GM Tools added

### Added
- CSS Editor for GMs to customize Foundry's appearance
  - Accessible via toolbar button
  - Live preview of CSS changes
  - Dark/Light mode toggle for editor
  - Smart indentation support
  - Copy, clear, and refresh buttons
  - Quick access to World Config and Settings
  - Smooth transition effects option
  - Changes sync to all connected clients
  - Dark themed window with light/dark editor modes
  - Proper handling of NPC type selection in Assistant panel
- Added refresh browser button to GM toolbar for quick page reloads
- Added visual character selection for skill check rolls
  - Card-based interface showing character portraits and details
  - Shows character level, class, and current HP
  - Visual selection state with hover effects
  - Only shows characters present on the canvas
  - Matches the visual style of other character cards in the system

### Fixed
- Fixed NPC type selection in Assistant panel to properly identify friendly NPCs
- Fixed CSS Editor window styling and content overflow issues
- Fixed minimum width handling in CSS Editor window
- Fixed dice roll button placement in global skill check rolls section
- Fixed drop zone styling and text in Assistant panel
- Fixed skill check roll dialog to use proper character selection UI

### Changed
- Moved dice roll functionality from Assistant criteria to global skill check rolls
- Improved drop zone UI with clearer instructions and visual feedback
- Enhanced skill check character selection with visual card-based interface
- Streamlined character selection process for skill checks

## [1.0.10] - 2025-03-25 - AI Tools

### Added
- Added character guidance into the AI tools
- Added Skillcheck lookups for monsters, items etc.  based on the selected character

### Fixed
- Fixed weapon display in character panel to properly show equipped weapons
- Simplified weapon display layout for better readability
- Fixed weapon data access in template to correctly show weapon properties
- Restored AI prompt functionality that was accidentally broken in previous update

### Changed
- Streamlined weapon display to show name and info next to image
- Simplified text colors to use default panel text colors
- Improved weapon information layout for better clarity

## [1.0.9] - Combat Tracker Enhancements

### Added
- Added visual feedback animation when dropping combatants in the initiative order
- Added improved drag and drop functionality in combat tracker
- Added visual indicators for drop zones between combatants
- Added "Roll Remaining" button to roll initiative for combatants without initiative
- Added option to automatically set first combatant when all initiatives are rolled
- Added automatic initiative rolling options:
  - Auto-roll for NPCs/monsters when added to combat
  - Auto-roll for player characters (configurable per user)
  - Auto-roll for remaining NPCs at round start

### Changed
- Enhanced cursor feedback during drag operations
- Improved spacing and visual feedback during drag and drop operations
- Updated drop target styling for better visibility
- Refactored combat tracker code for better maintainability and performance
- Enhanced initiative handling with more configuration options
- Improved mid-combat combatant addition with multiple initiative modes:
  - Auto-roll initiative
  - Set to act next
  - Add to end of round

### Fixed
- Fixed cursor styles not updating during drag operations
- Fixed initiative handling when adding new combatants mid-combat

## [1.0.8] - Encounter Toolbar

### Added
- Added Encounter Toolbar for journal entries with encounter metadata
- Added monster deployment functionality with multiple formation patterns (circle, line, random)
- Added combat creation and initiative rolling directly from journal entries
- Added encounter difficulty visualization in toolbar
- Added settings to control encounter toolbar behavior:
  - Enable/disable encounter toolbar
  - Auto-create combat after monster deployment
  - Configure monster deployment pattern

### Changed
- Improved metadata handling in journal entries
- Updated journal rendering hook to detect encounter journal entries

## [1.0.7] - Combat Timer Improvements

### Added
- Added token targeting detection to automatically start the combat timer
- Added more robust round change detection using a custom tracking variable
- Added detailed logging for better debugging of timer behavior
- Added drag and drop functionality for initiative in the combat tracker
- Added health bars to combat tracker tokens
- Added option to show portraits in combat tracker
- Added "Set as current combatant" button to combat tracker

### Changed
- Improved the interaction between Combat Timer and Planning Timer
  - Replaced direct API access with Hook-based communication
  - Simplified code structure for better maintainability
- Enhanced round change detection to prevent timer issues during round transitions
- Updated token movement detection for better compatibility with Foundry VTT v12

### Fixed
- Fixed issue with combat timer continuing to run during round changes
- Fixed multiple timer activations when round changes occur
- Fixed planning timer cleanup when transitioning between rounds
- Fixed round timer to pause when the session is not running

## [1.0.6] - Chat Message Improvements

### Added
- Added new settings for chat message control
  - Toggle for GM-only timer notifications
  - Configurable message visibility options
- Enhanced chat message handling for timers and notifications

### Changed
- Updated chat message system to respect GM-only settings
- Improved message handling for better user experience
- Fixed JSON formatting issues in chat responses

## [1.0.5] - Network Monitoring and Settings

### Added
- Added real-time latency monitoring system
  - Color-coded latency display next to player names
  - Configurable latency check frequency (5s to 5min)
  - Enable/disable latency display option
  - Automatic local GM detection for accurate readings
- Added new settings for latency monitoring
  - Toggle for enabling/disabling latency display
  - Slider for adjusting check frequency

### Changed
- Updated settings organization for better clarity
- Improved latency threshold values for more accurate status indication
- Enhanced socket message handling for better network communication

### Removed
- Removed the redundant dashboard now that we have the Squire module 

## [1.0.4] - Vote System and UI Improvements

### Added
- Added clickable vote tool area in menubar
- Added improved styling for vote section to match other UI elements

### Changed
- Updated vote tool UI to be more consistent with other elements
- Improved vote label alignment and styling
- Enhanced hover effects for vote controls

## [1.0.3] - UI Improvements and Bug Fixes

### Added
- Added quality of life aesthetic improvements
- Enhanced UI elements for better user experience

### Changed
- Updated module version to 1.0.3
- Improved overall visual consistency

## [1.0.2] - Cleanup and Refactor

### Added
- Added a new class for generating MVP descriptions based on combat stats.
- Added a new class for generating combat history.
- Added session timer date tracking to persist timer state between sessions
- Added ability to set current timer duration as the new default
- Added seconds display to session timer
- Added proper permission checks for vote initiation by party leader
- Added visual feedback for completed votes with checkmark icon

### Changed
- Moved MVPTemplates from mvp-templates.js into assets.js
- Moved MVPDescriptionGenerator class from mvp-description-generator.js into stats-combat.js
- Consolidated combat-related functionality into fewer files for better maintainability
- Modified session timer to use the default time when loading on a new day
- Updated timer dialog to include option for saving current duration as default
- Updated vote system to properly handle leader permissions
- Improved vote UI with better status indicators and button states

### Removed
- Removed unused debug.js file
- Removed mvp-templates.js after moving its contents
- Removed mvp-description-generator.js after moving its contents

## [1.0.1] - It's All About Timers

### Added
- Automated release workflow using GitHub Actions
  - Automatic ZIP file creation for releases
  - Automated release creation on new version tags
  - Release notes generation

### Fixed
- Fixed timer expiration messages being sent repeatedly
- Fixed "time is running out" warning messages being sent multiple times
- Fixed planning timer synchronization between GM and players
- Fixed timer cleanup and fadeout behavior for non-GM users
- Fixed permission issues with chat messages for non-GM users
- Improved timer state management and UI updates

### Changed
- Refactored timer code to use socketlib for better client synchronization
- Updated planning timer to match combat timer's behavior
- Improved timer expiration handling for consistency across all timer types

## [1.0.0] - 2025-01-22 - Initial Release

### Added
- Combat Statistics System
  - Core combat statistics tracking
  - Round-by-round tracking with summary display
  - MVP system with card-based stat display
  - Notable moments tracking with party focus
  - Party breakdown with individual performance stats
  - Combat session stats with accuracy tracking
  - Combat statistics chat output
- Combat Management
  - Combat timer with pause/resume functionality
  - Planning timer with strategic phase support
  - Turn tracking system with accurate timing
- UI Enhancements
  - Combat dashboard with real-time statistics
  - Visual progress indicators and timers
  - Multiple visual themes
  - Player portraits with rank overlays
  - Icons for critical hits and fumbles
  - Consistent header styling
- Full documentation and README
- FoundryVTT v12 compatibility

### Changed
- Updated Notable Moments section title to "Notable Party Moments"
- Ensured chat messages come from GM instead of selected token

### Fixed
- Fixed MVP player name formatting
- Adjusted fumble icon color for better visibility
