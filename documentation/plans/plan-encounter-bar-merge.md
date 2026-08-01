# Plan: Merge the Encounter Bar into the Combat Bar

**Status: Implemented (phases 1-3). Phases 4-8 pending.**

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

One always-present bar, labelled Encounter, in two rows.

**Row 1, the readout row** — always present, directly under the primary menubar. Item-driven (see the
hybrid-rendering constraint below), so contributions are declarative and siblings can add to it.

**Row 2, the portrait strip** — present only during combat. Bespoke markup: scrolling, health rings,
drag-to-reorder, hover cards.

Row 1 sits above row 2 so that the readouts never move. If they sat below, every combat start would shove
them down by the height of the portrait strip and every combat end would yank them back.

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
therefore gets its custom payload or items, never both. Making row 1 item-driven means teaching that method
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

**Height is load-bearing, and a second row changes what the size settings mean.**
`--blacksmith-menubar-total-height` offsets the Foundry UI below the menubar, so a wrong height misplaces
every element under it. With two rows, `menubarCombatSize` and `menubarCombatSizeIdle` have to be redefined
as either the whole bar or the portrait row alone. Phase 4 has to decide and say which.

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

**Phase 4 — The readout row.** Teach `_prepareSecondaryBarData` to prepare items *and* pass a custom
payload for a bar that asks for both, then add row 1 to the combat template as an item-rendered zone set.
Decide and document what the two size settings mean once there are two rows. Rework the endcaps in the same
pass, since they are the same markup: fold turn into the round endcap on the left, and delete the combatant
name endcap. Ship the row with no occupants other than the endcaps to prove the rendering before anything
depends on it.

**Phase 5 — Challenge Rating.** Register Party CR, Monster CR, and Difficulty as `info` items on row 1,
GM-gated, with the merged bar registering its own debounced token hooks rather than borrowing
`EncounterToolbar`'s. Heading becomes "Challenge Rating" and the labels lose the "CR", which the heading
makes redundant. Hide the CR pair in combat; keep Difficulty as a tinted chip.

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
