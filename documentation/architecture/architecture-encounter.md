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

## The tracker is the authority

**Turn order is the tracker's, never the bar's.** `getCombatData` maps `combat.turns` and does not sort.
Foundry sequences turns through that array, and its order includes the system's tiebreak, so any local sort
disagrees with the tracker whenever initiative ties — and the tracker is what "next turn" actually follows.
This applies to anything else that orders combatants.

Blacksmith's additions to the tracker live in `ui-combat-tracker.js`: a Roll Remaining button injected
beside Foundry's roll controls, automatic initiative rolling for players and non-players on round changes,
turn-change token selection, and open/close control used by the bar's Encounter menu. The two countdown
timers inject themselves separately, from their own modules.

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
Tokens menus, turn navigation, the portrait strip, the graveyard, and the begin/end button.

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

The combat row's height is `menubarCombatSize` in combat and `menubarCombatSizeIdle` outside it; the total
is that plus the data row.

**Apply height before building bar data.** Ring geometry is computed inside `getCombatData` by reading the
combat-height variable through `getComputedStyle`, so setting it afterwards sizes rings from the previous
state.

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
challenge rating. **The middle zone is deliberately empty**, reserved for real-time stats. Groups within a
zone are separated by dividers automatically, so the grouping is what produces the pipes.

Bar widths are CSS `clamp()` strings rather than pixel numbers — the item preparation passes a string
`width` through to the inline style verbatim, so a clamp gives "as wide as the space allows, down to a
floor" without needing `!important` to beat that inline value.

When the row still cannot fit, `applyReadoutOverflow` hides readouts in a fixed order rather than letting
everything squeeze: party health, then monster health, then the timer. It measures `scrollWidth` against
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
