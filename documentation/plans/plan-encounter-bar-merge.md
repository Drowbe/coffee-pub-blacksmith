# Plan: Merge the Encounter Bar into the Combat Bar

**Status: Implemented (phases 1-4, phase 5 partly). Phases 5-8 pending.**

Fold the encounter secondary bar's tools and readouts into the combat bar, retire the encounter bar, and
relabel the result "Encounter". The merged bar is always present, adapts its contents to whether combat is
running, and carries enough state that the combat tracker never needs opening.

## Why

The two bars are tenants of one slot. `MenuBar.secondaryBar` is a single object with one `type`
(`api-menubar.js:58`), and `openSecondaryBar` closes whatever was open before doing anything else
(`api-menubar.js:2350`). Combat, encounter, and party are mutually exclusive by construction.

That would be a minor annoyance except for how the eviction fires. `createCombat` and the first
`createCombatant` both auto-open the combat bar (`manager-combatbar.js:345`, `:356`), and the encounter
bar's primary action is Create Combat (`ui-journal-encounter.js:1556`). The most likely way to leave the
encounter bar is to press its own main button, which is why the workflow had been a constant toggle
between the two.

The deeper point: the encounter bar's contents are mostly *combat* tools. Reveal is used mid-combat to
mass-unhide. Create Combat is used repeatedly during an encounter to fold in newly-placed tokens — it
already skips combatants that are in the tracker. Challenge Rating is wanted both in and out of combat.
Only the Clear buttons are genuinely out-of-combat tools.

## Target state

One always-present bar, labelled Encounter, in a single row.

**One row, not two.** The readouts sit beside the portraits in the item zones, grouped with labelled banners, which is how every other secondary bar in the suite is laid out (Broadcast, Cartographer). Vertical space is the scarce resource on a wide screen and stacking rows spends it; horizontal space is plentiful. An earlier attempt at a second row shrank the action buttons to fit and was reverted.

Contents by state:

| Element | Out of combat | In combat |
|---|---|---|
| Portrait strip | absent | full strip |
| Round / Turn endcap | absent | Round with turn folded in |
| Combatant name endcap | removed | removed — the highlighted portrait already says it |
| Initiatives button | hidden | shown, menu unchanged |
| Encounter button | shown | shown, per-item adaptation |
| Create Combat | "Create Combat" | "Add to Combat" |
| Tokens button | shown | shown |
| Clear actions | shown | hidden |
| Graveyard | absent | shown when the dead are hidden |
| Party CR / Monster CR | shown | hidden |
| Difficulty | shown | shown, as a tinted chip |
| Party health | shown | shown |
| Monster health | shown | shown |
| Party-vs-monster balance | shown | shown |
| Turn and planning timers | absent | shown |
| Round and combat timers | absent | shown |

**Challenge Rating is a design-time readout; the balance bar is its run-time successor.** CR answers "should
I run this fight" and stops changing once the fight starts. During combat the same question is answered
live by party-versus-monster health. So the CR pair gives up its space when combat begins, Difficulty stays
as a one-chip reminder of what was expected, and the balance bar and timers take the room. This is the
existing `isInCombat` switch doing the work; no new state is involved.

Menu layout for the two menu buttons:

```
ENCOUNTER   Create Combat / Add to Combat
            Quick Encounter
            (remaining encounter-bar items, each gated on applicability)

TOKENS      Reveal Hidden
            Remove Party from Canvas
            Remove Monsters from Canvas
            Remove NPCs from Canvas
```

## Constraints discovered in the code

**Everything on the readout list is already an item kind; only the portrait strip is not.** The item
vocabulary is `info`, `progressbar`, and `balancebar` (`api-menubar.js:1975-1990`), each with a live-update
path through `updateSecondaryBarItemInfo`. CR chips are `info`. Party and monster health are `progressbar` —
the party bar's own health readout already is one (`api-menubar.js:709`). The party-versus-monster balance
and the timers are `balancebar` and `progressbar`. Hand-rolling any of these in bespoke markup would be
rebuilding what already exists, styled and wired.

**The blocker is that rendering treats the two modes as exclusive.** `_prepareSecondaryBarData` returns
early for a custom template and never prepares zones or items (`api-menubar.js:2684`). The combat bar
therefore gets its custom payload or items, never both. Making the readouts item-driven means teaching that method
to do both for a bar that asks for it. This is a contained change to one method, and it is the substance of
phase 4 — not Challenge Rating, which rides on top of it.

**The CR refresh trigger is gated behind an unrelated setting.** CR values recalculate from
`createToken` / `updateToken` / `deleteToken` with a 250ms debounce, but those hooks are only registered when
`enableJournalEncounterToolbarRealTimeUpdates` is on (`ui-journal-encounter.js:173`). It is world-scoped and
defaults to true, so the staleness rarely shows — but it is a setting named after journal toolbars, filed
under Automation, and turning it off would silently freeze a readout on a permanently visible bar. The
merged bar must register its own token hooks rather than depend on `EncounterToolbar`'s.

**CR is canvas-scoped, not encounter-scoped.** `getPartyCR` counts player-owned character tokens on the
scene and `getMonsterCR({monsters: []})` does the canvas-only calculation (`manager-encounter.js:16`,
`:115`). Keep it that way: it is what the number means today, and it is what tells you whether the fight you
are about to have is fair. Health and the balance bar should follow the same scoping out of combat and
switch to tracker-scoped once combat starts, since that is what "how is this going" means.

**Monster health does not exist.** Party health is `_refreshPartyBarInfo` (`api-menubar.js:540`). The
monster mirror has to be written, and the balance bar needs both sides.

**Two timer sources, two states of readiness.** `getCombatData` already computes `totalCombatDuration` and
`currentRoundDuration` and passes both to the template, which ignores them — those need markup, not
plumbing. The turn and planning timers come from `timer-combat.js` and `timer-planning.js` and need a feed.

**The rename must stay cosmetic.** The type id `'combat'`, the `secondaryBarToolMapping` entry
(`manager-combatbar.js:165`), and the settings keys `menubarCombatShow`, `menubarCombatSize`,
`menubarCombatSizeIdle`, `menubarCombatHideDead` all say "combat". Renaming the type id collides with the
still-registered `'encounter'` type during the overlap period, and renaming settings keys is a data
migration rather than a rename. Change user-facing labels and tooltips only; leave every identifier alone.

**Visibility gating differs.** The encounter menubar tool is `gmOnly: true` (`ui-journal-encounter.js:1651`)
and its items carry `visible: () => game.user.isGM`. The combat bar is for everyone. Challenge Rating and
monster health are GM information and need explicit gating in their new home; party health and the timers
are not.

**Quick Encounter has an unresolved owner.** It is gated on `!!api.hasQuickEncounterTool?.()`
(`ui-journal-encounter.js:1573`), so another module supplies the capability. Confirm which one owns it, and
whether it adds monsters to the *current* encounter or only creates new ones, before moving it.

**Height is load-bearing.** `--blacksmith-menubar-total-height` offsets the Foundry UI below the menubar,
so a wrong height misplaces every element under it. `menubarCombatSize` and `menubarCombatSizeIdle` size
the whole bar, which stays one row.

**Read `documentation/api/api-menubar.md` before designing bar layout.** The house pattern is documented
there and the other suite bars follow it: one row, items in left/middle/right zones, grouped with labelled
banners via `groupBannerEnabled`, banners sized at 20% of bar height and progressbars at 40%. Phase 4 was
first built as a second row with shrunken buttons because that doc was not read; it was reverted. Grepping
the code shows what the machinery can do, not what the suite has decided to look like.

**Test both states, every time.** Two of the seven phase-2 defects were only reachable out of combat, and
the in-combat path exercises almost none of that code.

## Phases

**Phase 1 — Buttons alongside the existing bar. Done.** The Encounter menu gained Create Combat / Add to
Combat and Quick Encounter, and a Tokens button now carries Reveal Hidden and the three canvas-clearing
actions. All of them call the same handlers the encounter bar's items call. The encounter bar is untouched
and still registered, so the two overlap and can be compared directly.

**Phase 2 — Always-on lifecycle. Done.** The bar's existence no longer depends on a combat existing;
combat state decides what it contains. `getIdleBarData()` is the out-of-combat payload, returned by
`getCombatData(null)` and also by its `catch`, so a thrown error degrades to a working bar instead of an
empty shell. `isInCombat` gates the portrait strip and its scroll arrows, both endcaps, and the Initiatives
button; the Graveyard and the Begin/End Combat button were already gated on data that is empty when idle.

Seven separate places assumed a combat exists, and all of them had to change together — any one left
behind reintroduces the disappearance, in a different form each time:

- `openCombatBar` returned false with no active combat
- `updateCombatBar` called `closeCombatBar` when `game.combats.active` was gone
- the `deleteCombat` hook closed the bar outright
- `canvasReady` in `api-menubar.js` closed it on any scene with no combatants
- `checkActiveCombatOnLoad` only opened for a combat that already had combatants
- the `combat-bar` menubar tool's `visible` predicate required an active combat with combatants, so the
  only control that reopens the bar vanished for exactly the stretch the bar now covers
- the `_prepareSecondaryBarData` patch guarded on `!data.data`, which the base method makes unreachable by
  assigning `data.data = {}` for custom templates first; a bar whose payload went missing therefore
  rendered from an empty object, producing a tray with nothing in it

The fifth is now `openCombatBarOnLoad` and opens whenever `menubarCombatShow` allows, which is what makes
the bar present at the start of a session. `closeCombatBar` remains as a deliberate API action; nothing
calls it automatically any more.

The canvas-clearing actions still show during combat. Hiding them is a presentation decision the plan can
take at any point, not a lifecycle one, and it is no longer load-bearing now that they are reachable out of
combat.

**Phase 3 — Two sizes. Done.** `menubarCombatSizeIdle` (default 40) sits beside `menubarCombatSize`
(default 60), and `resolveBarHeight(isInCombat)` is the only reader of either. `applyBarHeight` is the only
writer of the height variables, and `updateCombatBar` calls both on every render — which is what keeps the
sizes in step, since every combat-state transition already routes through it.

Two things about this are easy to get wrong and are worth not rediscovering:

- **Order matters.** Portrait ring geometry is computed inside `getCombatData` by reading
  `--blacksmith-menubar-secondary-combat-height` through `getComputedStyle`. Applying the height after
  building the data sizes the rings from the previous state. Height first, always.
- **Two variables, two jobs.** `--blacksmith-menubar-secondary-height` drives the layout — portrait sizes,
  button sizes, font sizes, and `--blacksmith-menubar-total-height`, which offsets the Foundry UI below the
  menubar. `--blacksmith-menubar-secondary-combat-height` is read only by the ring math in JS. Writing one
  and not the other is what made the size setting appear to do nothing but resize health rings.

**Phase 4 — Readouts as registered items. Done.** A bar type may now declare `hybridItems: true`, which makes
`_prepareSecondaryBarData` fall through to the zone preparation instead of returning early for a custom
template. Because `menubar.hbs` invokes a custom partial with `secondaryBar.data` as its context, the
prepared zones and banner settings are copied onto `data.data`, which lets the combat template hand its own
context straight to `menubar-secondary-default` and reuse the entire item rendering rather than restating
it.

The items render in the space the combatant-name endcap used to occupy, sharing the single row with the
portraits. The bar keeps one height and the action buttons keep their size.

This was first built as a second row, with the action buttons moved into it and shrunk to fit, and the size
settings redefined as "portrait row only". That was wrong on the fundamental tradeoff: vertical space is the
scarce resource on a wide screen while horizontal space is plentiful, and it was invented against a
documented house pattern — one row, zones, banner-labelled groups — that the other suite bars already
follow. It was reverted. `menubarCombatSize` and `menubarCombatSizeIdle` keep their phase-3 meaning of the
whole bar.

The endcap rework rode along, since it is the same markup: round and turn are one endcap on the left, and
the combatant-name endcap on the right is gone. Its label-above-value emphasis was inverted for the new
content, so the left endcap's two lines now read headline-above-detail.

Found while removing the right endcap: `timer-round.js` caches `.combat-endcap-left .combat-time-round` and
`.combat-endcap-right .combat-time-total`, but those classes exist only in `templates/timer-round.hbs` and
never in the combat bar. Both cache entries have always been empty. The combat bar was evidently meant to
show the round and total timers in its endcaps and never did, which is also why `getCombatData` computes
`totalCombatDuration` and `currentRoundDuration` and the template ignores them. Phase 7 should either wire
them up or delete the dead cache entries.

**Phase 5 — Challenge Rating. Partly done.** Party CR, Monster CR, and Difficulty are registered as `info`
items in a banner-labelled `challenge` group, GM-gated, refreshed by the bar's own debounced
`createToken` / `updateToken` / `deleteToken` hooks rather than `EncounterToolbar`'s. Labels are "Party" and
"Monster" with the banner carrying the heading, so the values lose the "CR". Landed early so the row had
something real in it to review — an empty row cannot be judged.

Still to do: hide the CR pair once combat starts and keep Difficulty alone as a tinted chip, per the
design-time/run-time split. Deferred until the balance bar exists to take the space, since hiding them
first would just leave a gap.

**Phase 6 — Health.** Party health as a `progressbar` reusing the party bar's calculation; monster health as
a new mirror of it. Canvas-scoped out of combat, tracker-scoped in combat.

**Phase 7 — Balance and timers.** The party-versus-monster `balancebar`, then the round and combat timers
(already in the payload, unused), then the turn and planning timers fed from `timer-combat.js` and
`timer-planning.js`. At the end of this phase the bar should carry everything the combat tracker shows.

**Phase 8 — Retire the encounter bar.** Remove the `registerSecondaryBarType('encounter')` block and its
items, drop the encounter menubar tool, and relabel the merged bar. Identifiers stay as they are.

## Related work

`menubarCombatSize` did not resize the bar at all before this plan was written — the setting fed a variable
no CSS read, while the bar's height came from a value frozen at registration. That was fixed independently
and was a prerequisite for phase 3, since two sizes cannot work until one does.
