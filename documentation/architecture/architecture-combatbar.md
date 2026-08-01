# Combat Bar — Architecture

**Audience:** Contributors to the Blacksmith codebase.

The combat bar is a secondary menubar that is always present and changes its contents according to whether
an encounter is running. It is the only secondary bar that renders custom markup and registered items at
once. The public registration surface it uses is documented in **documentation/api/api-menubar.md**.

**Files:**

| File | Role |
|---|---|
| `scripts/manager-combatbar.js` | `CombatBarManager` — data, menus, readout items, height, hooks |
| `templates/partials/menubar-combat.hbs` | The two rows |
| `styles/menubar-combatbar.css` | Row layout, portrait sizing, readout overrides |
| `scripts/api-menubar.js` | Secondary bar machinery, including hybrid rendering |

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

**Challenge rating and monster health are GM-only.** Round, turn, party health and the timers are not.

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

Ordering is the combat tracker's. `getCombatData` maps `combat.turns` and does not sort — Foundry's own
turn order includes the system's tiebreak, and any local sort disagrees with it whenever initiative ties.

**Test both states.** The in-combat path exercises almost none of the out-of-combat code, and several
defects here were only ever reachable outside an encounter.
