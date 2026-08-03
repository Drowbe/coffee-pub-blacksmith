# Encounter — Architecture

**Audience:** Contributors to the Blacksmith codebase.

Blacksmith presents an encounter through two surfaces: Foundry's combat tracker, which it augments, and the
combat bar, a secondary menubar it owns outright. They draw the same encounter and share several contracts,
so they are documented together — the coordination between them is the part that has no other home. The
public registration surface the bar uses is documented in **documentation/api/api-menubar.md**; the timers
both surfaces draw are in **documentation/architecture/architecture-timers.md**.

**Files:**

| File | Role |
|---|---|
| `scripts/manager-combatbar.js` | `CombatBarManager` — bar data, menus, readout items, height, hooks |
| `templates/partials/menubar-combat.hbs` | The bar's two rows |
| `styles/menubar-combatbar.css` | Row layout, portrait sizing, readout overrides |
| `scripts/ui-combat-tracker.js` | `CombatTracker` — Blacksmith's additions to Foundry's tracker |
| `scripts/manager-encounter.js` | `EncounterManager` — challenge rating, canvas token actions |
| `scripts/api-menubar.js` | Secondary bar machinery, including hybrid rendering |

There is no separate encounter bar. It was merged into this one and retired; its tools, challenge rating,
and canvas actions all live here now.

## The tracker is the authority

**Turn order is the tracker's, never the bar's.** `getCombatData` maps `combat.turns` and does not sort.
Foundry sequences turns through that array, and its order includes the system's tiebreak, so any local sort
disagrees with the tracker whenever initiative ties — and the tracker is what "next turn" actually follows.
This applies to anything else that orders combatants.

Blacksmith's additions to the tracker live in `ui-combat-tracker.js`: a Roll Remaining button injected
beside Foundry's roll controls, automatic initiative rolling for players and non-players on round changes,
turn-change token selection, and open/close control used by the bar's Encounter menu. The two countdown
timers inject themselves separately, from their own modules.

**A combatant's actor may have no hit points, and Foundry will not stop you.** A dnd5e `group` actor can be
placed on the canvas and added to combat like anything else, and it carries `system.members` rather than
`system.attributes.hp`. Any code walking `combat.turns` or the tracker's rows must treat
`system.attributes.hp` as optional — confirmed in play 2026-08-03, where a group actor on the canvas threw
inside the `renderCombatTracker` hook and took the callback down **mid-loop**, so every combatant after it
lost its health ring, portrait state, and controls. The visible failure was a broken tracker; the cause was
one unusual row. The same caution applies to `hasPlayerOwner` type tests, which will happily classify a
group actor as an NPC.

## What each surface is for

The tracker is the full list: every combatant, every control, initiative editing. The bar is the glanceable
subset plus the encounter-level actions, and it is always on screen. Where both can do a thing, the bar
calls the same code rather than reimplementing it — `_rollRemainingInitiatives`, `toggleCombatTracker`, the
timers' display and click handlers, `EncounterManager`'s challenge rating and canvas actions.

The intent is that the bar carries enough that the tracker need not be opened during play.

## Two rows, two jobs

**The data row** is a fixed height and holds readouts only: round and turn, the timer slot, party and
monster health, challenge rating. They are registered items rendered by the shared
`menubar-secondary-default` partial.

**The combat row** scales with the user's size setting and holds controls: the Initiatives, Encounter and
Tokens menus, turn navigation, the portrait strip, the graveyard, and the begin/end button. It is rendered
only when it would have contents — in combat, or for a GM — so a player between encounters sees the data
row alone rather than an empty strip.

**The encounter and token actions have two presentations of one definition.** `getBarActions()` is the
single source; in combat they are rows in the Encounter and Tokens context menus, because the row's space
belongs to the portraits, and out of combat the same entries are pulled out and rendered as ordinary bar
buttons. They carry the shared `secondary-bar-item` classes rather than combat-bar ones, so they look like
every other bar button instead of being styled to resemble one.

The split is not cosmetic. **Item sizing is pinned to bar height** — group banners at 20% of it, item
minimums at bar height minus chrome applied to *width* as well as height, progressbar height at 40% — while
the combat row must scale because portraits need it. Items placed in a portrait-scaled row inflate into
large squares and progress bars become slabs. A fixed row gives them a constant basis.

The data row sits **above** the combat row so its contents never move when the combat row resizes or the
portrait strip appears. It is present for players as well as GMs.

Group banners are off. A banner captions a cluster of otherwise unlabelled buttons, which is what the
Broadcast and Cartographer bars need; these items carry their own labels. Groups remain, as divider
boundaries.

## Hybrid rendering

The bar registers with `templatePath` **and** `hybridItems: true`. Without the flag, a custom-template bar
replaces the whole bar and `registerSecondaryBarItem` rejects items — the two modes were mutually exclusive.
The flag makes `_prepareSecondaryBarData` fall through to zone preparation, and because `menubar.hbs`
invokes a custom partial with `secondaryBar.data` as its context, the prepared zones and banner settings are
copied onto that object. The template then passes its own context straight to the shared partial:

```handlebars
{{> "menubar-secondary-default" this}}
```

The zones are attached to a **copy**, not to `this.secondaryBar.data`: the value fingerprint
JSON-stringifies that object, and folding zones into it would stringify every item on every render.

`_secondaryBarStructureSignature` includes the item signature for hybrid bars rather than returning early
as it does for pure custom templates; otherwise an item appearing or changing visibility could not trigger
a rebuild.

The portrait strip is the only thing on this bar the item vocabulary cannot express. Everything else is
`info`, `progressbar`, or `balancebar` and belongs as an item.

## Height

`CombatBarManager.applyBarHeight(menuBar, isInCombat)` is the only writer of the height variables.

| Variable | Drives |
|---|---|
| `--blacksmith-combatbar-data-height` | the data row; a constant, `DATA_ROW_HEIGHT` |
| `--blacksmith-combatbar-combat-height` | the combat row, portraits, buttons, endcap fonts |
| `--blacksmith-menubar-secondary-height` | the bar total, and `--blacksmith-menubar-total-height`, which offsets the Foundry UI below the menubar |
| `--blacksmith-menubar-secondary-combat-height` | read by `getCombatData` for portrait ring geometry |

The combat row's height is `menubarCombatSize` in combat, and the menubar's own default secondary bar
height outside it — only the in-combat height is configurable, because only in combat does the row hold
anything that scales. The total
is that plus the data row.

**Apply height before building bar data.** Ring geometry is computed inside `getCombatData` by reading the
combat-height variable through `getComputedStyle`, so setting it afterwards sizes rings from the previous
state.

## Every row re-bases the shared item sizing

Shared components size themselves from `--blacksmith-menubar-secondary-height`, which is the height of the
whole bar. This bar is two rows, so anything shared dropped into either one would size itself from the total
and come out far too large — a button rendered in the combat row took its font from ~70px and rendered at
28px type.

So **each row shadows that variable to its own height**, and anything shared rendered inside it adapts with
no override. Do not style around a mis-sized shared component; give its row the right basis and the
component is already correct.

Shadowing the height alone is not sufficient, for the reason in the next section: the font, icon, padding,
and gap variables are declared at `:root`, so they resolve there. They are redeclared per row in terms of
the shadowed height. What the shadow alone does cover is anything declared inside the subtree or resolved
at point of use — group banner height, item `min-height` / `min-width`, and the progressbar and balancebar
heights JS writes as an inline `calc()`.

A new row must do the same, or the first shared component placed in it will be wrong in a way that looks
like a styling bug rather than a sizing basis.

## Custom property traps

Three distinct ways a value can fail to reach where it is needed. All three were live bugs.

**A declaration on an element beats what it would inherit.** Fallbacks for JS-written variables must be on
`:root`. Declared on `.blacksmith-menubar-secondary`, they became the bar's own value and ignored what
`applyBarHeight` wrote to the document element — portraits sized off the 60px fallback inside a row scaled
to the real setting, and the difference showed as dead space.

**A variable substitutes at computed-value time on the element that declares it.** The item font, icon,
padding and gap variables are declared at `:root` in terms of bar height, so they resolve there and inherit
down already resolved. The data row redeclares `--blacksmith-menubar-secondary-height` to re-base its
subtree, which reaches the group banner height, the item minimums, and the progressbar height (an inline
`calc()` resolved at point of use) — but *not* those five, which have to be redeclared themselves.

**Inline styles beat the stylesheet.** The shared partial writes `background-color: {{progressColor}}`
inline on a progressbar fill, so a state class cannot colour it. The timer readouts clear that inline value
on write, handing colour back to CSS.

## Readouts

Registered in `registerReadoutItems`, refreshed by `refreshReadoutItems`, both in `manager-combatbar.js`.

Readouts strip the shared item chrome — fill, border, radius, pointer cursor, hover lift, square minimum
width — because the shared rule styles every item as a button, which on a default bar every item is.

**Challenge rating and monster health are GM-only.** Round, turn, party health, the timers, and the balance
bar are not — the balance bar reports a relationship ("the party is ahead") rather than a quantity, so it
gives the table the boss-bar read without disclosing what a monster has left.

**Challenge rating scopes with combat, it does not hide.** Out of combat it rates the fight as designed —
everything on the canvas. In combat it rates the party against what is actually in the encounter, so a fight
can be scaled while it runs by adding or removing combatants and watching the number move. Same rule as
health, same reason. `EncounterManager.getPartyCR`, `getMonsterCR`, and `getCombatAssessment` each take an
optional token-or-combatant list for this, defaulting to the canvas so the encounter bar and the journal
toolbars are unaffected.

The balance bar's value is `partyPercent - monsterPercent`, so zero means both sides are equally worn and
+100 means the monsters are down with the party untouched. Percentages rather than raw HP, so a big-pool
boss and a swarm read on the same scale. The shared marker maths is `50 + (p / 2)`, which puts negative left
and positive right — hence left is the monsters' side. It carries **no labels**: it is a measure of balance,
not a second place to read the health numbers, which the two health bars already give.

Zones: the left zone holds round, turn, and the timer slot; the right zone holds health, balance, and
challenge rating; the middle zone holds the party statistics. Groups within a zone are separated by
dividers automatically, so the grouping is what produces the pipes.

### Update timing

Three clocks drive this row, and assuming one explains all of it is the most common way to misread the
bar. The symptom that gives it away: a health bar jumps the instant damage applies while the damage
figure beside it sits still for a moment, then moves on its own with nothing else happening.

| Readout | Read from | When it moves |
|---|---|---|
| Round, turn | the combat document | On the change |
| Party health, monster health, balance | `getHealthSummaries()`, live actor HP | On the change |
| Challenge rating | `EncounterManager.getCombatAssessment` | On the change |
| Planning and turn timer | `syncTimerReadout`, writing DOM directly | Once a second |
| The live statistics set | the `combatStats` combat flag | Up to one second behind the event |
| The lifetime standings set | the `PartyStats` cache | Once per combat |

The first three read live documents and refresh on `updateActor`, `updateToken`, `updateCombat` and
`updateCombatant` (`manager-combatbar.js:1458`, `:1475`), so they are as current as Foundry is.

The timers are on their own path entirely. They tick once a second and are written straight into their
bars by `syncTimerReadout` through the `blacksmithTimerDisplay` hook (`:1015`), never through
`updateSecondaryBarItemInfo` — rebuilding a bar once a second for the whole of every combat is the cost
that path exists to avoid.

The live statistics are the ones that lag, and the delay is structural rather than incidental.
`getRunningStats()` reads the combat flag rather than the GM's own memory, and that flag is mirrored on
a one-second debounce (`stats-combat.js:114`). The reason the GM reads the flag too is in
`architecture-stats.md`; the consequence here is that these figures trail their event by up to a second
and are null for the opening moments of a fight, so the chips show their registered placeholders until
the first mirror lands.

**The refresh trigger and the data freshness are separate things**, which is what produces the symptom
above. An HP change fires `updateActor`, the bar refreshes, and the statistics are re-read from a flag
that has not been written yet — so health moves and damage does not. The flag write then fires
`updateCombat` on every client a moment later, refreshing the bar again with nothing else having
happened.

Nothing in the live set is per **round**, despite the naming inviting it: these are cumulative over the
whole fight. `getCurrentStats()` is the round accumulator despite reading as "now"; `getRunningStats()`
is the running total the bar shows (`stats-combat.js:1407` says so at the source).

### Party statistics

Two sets share the middle zone, swapped by combat state through `visible` predicates. Out of combat the bar
shows the standings, which change only when a combat ends: biggest hit on record, most fumbles, top MVP,
most criticals, most hits, fewest misses, total damage, total kills, combats fought, and average hit rate.
In combat it shows the fight in progress: party damage dealt, hit rate, biggest hit so far, kills, damage
taken, healing given, and the leading MVP.

Ten and seven, and **not all of them fit** — that is the design rather than an oversight.
`READOUT_SUPPRESSION_ORDER` decides what a given bar width actually shows, so the list is a ranking from
"nice to have" to "the reason the zone exists". Campaign-scale figures rank lowest: they change once per
combat and the Party Statistics window has them any time. The three originals in each set rank highest.
Adding a readout therefore means deciding where it sits in that ranking, not just registering it.

The per-person standings carry a **portrait instead of a name**. Three chips reading "Kar-ahn 26",
"Favia 2", "Favia" are unreadable at a glance — two of them are the same word meaning different things —
and a face is recognised instantly where a truncated first name is not. The name stays in the tooltip.
Party-scale totals carry no portrait, deliberately: they belong to the party rather than to anyone in it.
`compactNumber` renders thousands as `8.4k`, since a lifetime total reaches five or six digits over a
campaign and a chip is about four characters wide before it pushes its neighbours out of the bar.

One tooltip does real work: `mostMisses` is ranked **low-is-best** by the aggregate, so that chip means
"fewest misses" and the tooltip says so. Without it the number reads as an accusation rather than a credit.

**The bar reduces nothing.** It reads `stats.party.getAggregateSync()` for the standings and
`stats.combat.getRunningStats()` for the running fight, both of which are single reductions shared with the
Party Statistics window and the end-of-combat card. A figure on the bar that disagreed with the card a
moment later would be worse than showing no figure at all — see `architecture-stats.md`.

**Everyone sees both sets.** These exist for the table — the point of "biggest hit" is the player who
landed it seeing it — so neither set is GM information the way the challenge rating is. Lifetime figures
reduce actor flags and the stored combat history, a world setting, so they are on every client already.
Running figures come from the combat flag the GM mirrors the accumulator to, which **every client reads,
the GM included** — see `CombatStats.getRunningCombatSource` and `architecture-stats.md`. The bar therefore
shows the GM exactly what it shows the table, which is the point: a broken mirror cannot look fine on the
one screen able to diagnose it. The value trails by up to the persistence debounce and is null for the
first moments of a combat, so the chips show their registered placeholders until the first mirror lands — a
flag write fires `updateCombat`, which brings the bar back through the refresh on its own.

The standings read is synchronous by design. `getAggregateSync()` returns the cache when warm, which is
almost always, since it only rebuilds when a combat ends or an actor changes. The async `getAggregate()`
fallback exists for the cold start and writes when it lands, which keeps `refreshStatReadouts` synchronous
for a caller that runs inside the render path. The bar also refreshes on `blacksmith.combatSummaryReady` —
the same hook `stats.party` invalidates on — because a table that has just finished a fight is looking at
the bar at exactly the moment the previous combat's standings would still be showing.

Names are shortened to their first word (`shortenName`), so "Favia Gita" reads as "Favia". The middle zone
is `flex: 1 1 0`, so a long name pushes the readouts either side of it around; the full name goes in the
tooltip, which carries the detail the chip has no room for — who hit whom for how much.

Bar widths are CSS `clamp()` strings rather than pixel numbers — the item preparation passes a string
`width` through to the inline style verbatim, so a clamp gives "as wide as the space allows, down to a
floor" without needing `!important` to beat that inline value.

When the row still cannot fit, `applyReadoutOverflow` hides readouts in a fixed order rather than letting
everything squeeze: the statistics first, since nothing in the moment depends on them, then party health,
then monster health, then the timer. Within each statistics set the least operational goes first, so what
survives longest is the biggest hit on record out of combat and the damage total in one. It measures
`scrollWidth` against
`clientWidth` after render and clears all suppression first, so the row recovers as it widens. This is
measured rather than expressed in CSS because "hide this one first" is an ordering CSS cannot state, and a
media query would be guessing at the row's width rather than reading it.

The balance marker is a full-height rule, not the shared 10px circle: a circle reads as a draggable handle
and invites a grab that does nothing.

Difficulty uses `CombatBarManager.getDifficultyChipColor`, not `EncounterManager.getDifficultyBorderColor`.
The latter's palette was picked as a *border* against the encounter bar's near-black background; as text on
this bar's warm translucent row those values read fluorescent, the greens worst.

Three text and icon sizes are declared for this row, all from the data row's height:

| Variable | Applies to |
|---|---|
| `--secondary-bar-item-font-size` | chip text — round, turn, challenge rating |
| `--blacksmith-combatbar-bar-font-size` | every label *inside* a bar — health, timer, balance |
| `--secondary-bar-item-icon-size` | all icons |

Labels inside a bar need their own variable because the shared rules style progressbar and balancebar labels
separately and each sets its own `font-size`, so without pulling them together they drift. They also sit on a
coloured fill rather than the row, and want to be a step smaller than the chip text rather than equal to it.
Icons run smaller again: at text size they compete with the value they label, and beside an 18px bar they
stop reading as adornment.

The party is `fa-helmet-battle` everywhere it appears — health, balance, and challenge rating — and the
monsters `fa-dragon`.

Combat row order is Encounter, Tokens, Initiatives (Initiatives only in combat), then turn navigation, the
portrait strip, the graveyard, the remaining navigation, and the begin/end button. The graveyard sits with
the portraits rather than with the controls, because it holds portraits the strip is hiding.

**Challenge rating and health are canvas-scoped out of combat and tracker-scoped in combat**, which follows
what the bar is being asked: whether the fight in front of you is fair, versus how the running fight is
going. The challenge rating refresh uses the bar's own debounced `createToken` / `updateToken` /
`deleteToken` hooks, deliberately not `EncounterToolbar`'s — those are registered only when
`enableJournalEncounterToolbarRealTimeUpdates` is on, and a readout on a permanently visible bar must not
go stale because a setting named after journal toolbars was switched off.

**HP totals dedupe linked tokens by actor id, and only linked ones.** Five unlinked goblins are five HP
pools; two tokens of one linked PC are a single pool. Deduping everything would collapse the goblins, since
unlinked synthetic actors share the prototype's id.

## Timers

The two countdown timers share one slot, as two items whose `visible` predicates are mutually exclusive.
Planning holds the slot while `PlanningTimer.verifyTimerConditions()` passes; the turn timer takes it when
`CombatTimer.shouldDisplay()` passes and planning does not. Neither predicate reads `state.isActive` — see
**documentation/architecture/architecture-timers.md** for why that flag does not mean what it looks like.

Values are written per tick straight into the rendered DOM from the `blacksmithTimerDisplay` hook, never
through a re-render. Only transitions rebuild, because those change which item is visible, which is
structural. Two consequences:

- Items are registered with **non-empty** labels, because the shared partial renders label spans behind
  `{{#if}}` and a span that never rendered cannot be written to.
- The first write after any render suppresses the CSS transition. A re-rendered item is built from the
  registered `percentProgress` of 0, so the jump to the real value would otherwise be animated into a
  second of the bar sweeping up to where it already was. The tracker never shows this because its markup
  persists between renders; this bar's is rebuilt on every combat update.

## Lifecycle

The bar's existence does not depend on a combat existing; combat state decides its contents.
`getIdleBarData()` is the out-of-combat payload, returned by `getCombatData(null)` and by its `catch`, so an
exception degrades to a working bar rather than an empty shell. `isInCombat` gates the portrait strip, its
scroll arrows, the round and turn readouts, and the Initiatives button.

Six paths previously tied the bar's life to a combat's and all had to change together: `openCombatBar`,
`updateCombatBar`, the `deleteCombat` hook, the `canvasReady` handler in `api-menubar.js`, the load-time
open, and the `combat-bar` menubar tool's `visible` predicate. `closeCombatBar` remains as a deliberate API
action; nothing calls it automatically.

**Test both states.** The in-combat path exercises almost none of the out-of-combat code, and several
defects here were only ever reachable outside an encounter.
