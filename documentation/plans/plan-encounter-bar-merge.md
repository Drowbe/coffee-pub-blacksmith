# Plan: Merge the Encounter Bar into the Combat Bar

**Status: Implemented (phases 1-3). Phases 4-5 pending.**

Fold the encounter secondary bar's tools and readouts into the combat bar, retire the encounter bar,
and relabel the result "Encounter". The merged bar is always present and adapts its contents to whether
combat is running.

## Why

The two bars are tenants of one slot. `MenuBar.secondaryBar` is a single object with one `type`
(`api-menubar.js:58`), and `openSecondaryBar` closes whatever was open before doing anything else
(`api-menubar.js:2350`). Combat, encounter, and party are mutually exclusive by construction.

That would be a minor annoyance except for how the eviction fires. `createCombat` and the first
`createCombatant` both auto-open the combat bar (`manager-combatbar.js:345`, `:356`), and the encounter
bar's primary action is Create Combat (`ui-journal-encounter.js:1556`). The most likely way to leave the
encounter bar is to press its own main button, which is why the current workflow is a constant toggle
between the two.

The deeper point: the encounter bar's contents are mostly *combat* tools. Reveal is used mid-combat to
mass-unhide. Create Combat is used repeatedly during an encounter to fold in newly-placed tokens — it
already skips combatants that are in the tracker. Challenge Rating is wanted both in and out of combat.
Only the Clear buttons are genuinely out-of-combat tools, and those are the ones that should hide when
combat is running.

## Target state

One always-present bar, labelled Encounter, whose contents adapt:

| Element | Out of combat | In combat |
|---|---|---|
| Portrait strip | absent | full strip |
| Round / Turn endcap | absent | Round with turn count folded in |
| Initiatives button | hidden | shown, menu unchanged |
| Encounter button | shown | shown, per-item adaptation |
| Create Combat | "Create Combat" | "Add to Combat" |
| Tokens button | shown | shown |
| Clear actions | shown | hidden |
| Challenge Rating readout | shown | shown |
| Graveyard | absent | shown when the dead are hidden |

Menu layout for the two new buttons:

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

**The rename must stay cosmetic.** The type id `'combat'`, the `secondaryBarToolMapping` entry
(`manager-combatbar.js:165`), and the settings keys `menubarCombatShow`, `menubarCombatSize`,
`menubarCombatHideDead` all say "combat". Renaming the type id collides with the still-registered
`'encounter'` type during the overlap period, and renaming settings keys is a data migration rather than
a rename. Change user-facing labels and tooltips only; leave every identifier alone.

**The bar has no out-of-combat lifecycle yet.** `openCombatBar` refuses when there is no active combat
(`manager-combatbar.js:906`) and `updateCombatBar` closes the bar when `game.combats.active` disappears
(`:678`). A manual open through the menubar tool does render an empty bar, because the patched
`openSecondaryBar` supplies empty data when there is no combat (`:200-218`), so the capability is half
present. Making the bar always-on means reworking those paths, not just relaxing a condition.

**Two independent height values.** The merged bar needs an in-combat size and an out-of-combat size, and
height is load-bearing: `--blacksmith-menubar-total-height` offsets the Foundry UI below the menubar, so a
wrong height misplaces every element under it. Height is also read by the portrait ring geometry in
`getCombatData` (`:720`). Any always-on bar must set its height on every transition between the two
states, not only on open.

**The combat bar cannot host registered items.** The encounter bar is built from
`registerSecondaryBarItem` calls rendered by the shared `menubar-secondary-default.hbs`. The combat bar is
a bespoke template plus five monkey-patched MenuBar methods (`manager-combatbar.js:199-249`) precisely
because the item vocabulary (button, info, progressbar, balancebar) cannot express a scrolling portrait
strip with health rings, drag-to-reorder, and hover cards. Encounter content therefore has to be
re-expressed as template markup and context menus, not moved across as items.

**Challenge Rating is the real work, not the buttons.** The action buttons are `onClick` handlers that a
context menu entry can call directly. Party CR, Monster CR, and Difficulty are live `info` items updated
through `updateSecondaryBarItemInfo` and refreshed by `EncounterToolbar._refreshEncounterBarInfo()`
(`ui-journal-encounter.js:1638`). The combat bar has no equivalent, so these become template fields plus a
rebuilt refresh path. Sequence this expecting plumbing.

**Visibility gating differs.** The encounter menubar tool is `gmOnly: true`
(`ui-journal-encounter.js:1651`) and its items carry `visible: () => game.user.isGM`. The combat bar is
for everyone and gates with `{{#if isGM}}` blocks in the template. Items moving across need per-entry
gating in the new location.

**Quick Encounter has an unresolved owner.** It is gated on `!!api.hasQuickEncounterTool?.()`
(`ui-journal-encounter.js:1573`), so another module supplies the capability. Confirm which one owns it,
and whether it adds monsters to the *current* encounter or only creates new ones, before moving it.

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

The last two were found only by testing out of combat, which is worth remembering for phases 3-5: the
in-combat path exercises almost none of this, so every change here needs checking in both states. The canvas-clearing actions still show during combat — hiding them is a
presentation decision the plan can take at any point, not a lifecycle one, and it is no longer load-bearing
now that they are reachable out of combat.

The bar is visibly thin out of combat: the Encounter and Tokens menus and nothing else. Phase 4 fills that
space with Challenge Rating.

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

**Phase 4 — Challenge Rating.** Move Party CR, Monster CR, and Difficulty into the merged bar as template
fields with their own refresh path. Retitle to "Challenge Rating" and drop the "CR" prefix from the values,
which the heading then makes redundant.

**Phase 5 — Retire the encounter bar.** Remove the `registerSecondaryBarType('encounter')` block and its
items, drop the encounter menubar tool, and relabel the merged bar. Identifiers stay as they are.

## Related work

`menubarCombatSize` did not resize the bar at all before this plan was written — the setting fed a variable
no CSS read, while the bar's height came from a value frozen at registration. That is fixed independently
and is a prerequisite for Phase 3, since two sizes cannot work until one does.
