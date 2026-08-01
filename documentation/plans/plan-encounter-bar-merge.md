# Plan: Merge the Encounter Bar into the Combat Bar

**Status: Implemented (phases 1-7). Phase 8 pending.**

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

One always-present bar, labelled Encounter, in two rows with different jobs.

**Data row** — fixed height, on top. Readouts only: round and turn, challenge rating, health, balance,
timers. Registered items in zones, grouped for divider separation. **No group banners**: a banner captions
a cluster of otherwise unlabelled buttons, which is what Broadcast and Cartographer need; a readout carries
its own label, so a banner above it only repeats the word.

**Combat row** — scales with the user's size setting because portraits need it. Controls only: the menu
buttons, turn navigation, the portrait strip, graveyard, and the begin/end button.

The split exists because **item sizing is pinned to bar height and the combat row has to scale**. Group
banners are 20% of bar height, item minimums are bar height minus chrome applied to width as well as
height, and progressbar height is 40% of bar height. At a portrait-sized row those inflate: chips become
large squares and progress bars become slabs. A fixed row gives them a constant basis.

The mechanism is one line of CSS: the data row redeclares `--blacksmith-menubar-secondary-height` as its
own height. Custom properties inherit, so the whole item subtree re-bases — including the progressbar
height, which is an inline `calc()` resolved in the element's own context. Neither the shared partial nor
the item JS needs to know rows exist.

Data on top so it never moves when the combat row resizes or the portrait strip appears. The row is present
for players too, not only GMs.

**The menu buttons stay in the combat row.** An earlier attempt moved them into the fixed row and shrank
them to fit; that was the mistake, not the existence of two rows. Nothing about a fixed readout row
requires touching the controls.

Contents by state:

| Element | Out of combat | In combat |
|---|---|---|
| Portrait strip | absent | full strip |
| Round and turn readouts | absent | data row, left zone |
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
| Turn and planning timers | absent | one shared slot |
| Round and combat timers | not built — elapsed counters have no percentage to fill | |

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

**HP totals need a linked/unlinked distinction.** Summing per token double-counts a linked PC with two
tokens on the scene; deduping by actor id collapses five unlinked goblins into one, because unlinked
synthetic actors share the prototype's id. Dedupe by actor id for linked tokens only.

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
the **combat row**; the bar total is that plus the fixed data row. Portrait and button dimensions derive
from the combat row's variable, never the total, or they would grow whenever the data row did.

**Read `documentation/api/api-menubar.md` before designing bar layout.** The house pattern is documented
there and the other suite bars follow it: items in left/middle/right zones, grouped with labelled
banners via `groupBannerEnabled` where the group is a set of buttons, banners sized at 20% of bar height
and progressbars at 40%. Phase 4 was
first built as a second row with shrunken buttons because that doc was not read; it was reverted. Grepping
the code shows what the machinery can do, not what the suite has decided to look like.

**Test both states, every time.** Two of the seven phase-2 defects were only reachable out of combat, and
the in-combat path exercises almost none of that code.

**Custom properties bit twice in phase 4; both traps are about *where* a variable is declared.**

- A variable declared on an element beats the value it would inherit. The row-height fallbacks were
  declared on `.blacksmith-menubar-secondary`, so the bar used them permanently and ignored what
  `applyBarHeight` wrote to the document element — portraits sized off the 60px fallback inside a row
  scaled to the real setting, and the difference showed as dead space. Fallbacks for JS-written variables
  belong on `:root`.
- A variable's value substitutes at computed-value time on the element that declares it. The item font,
  icon, padding, and gap variables are declared at `:root` in terms of the bar height, so they resolve
  there and inherit down already resolved. Redeclaring the bar height further down does not reach them;
  they have to be redeclared themselves.

Between them these mean: shadowing a height reaches anything resolved at point of use or declared inside
the subtree, and nothing else. Read the diagnostic table off the DOM rather than the document element when
checking — the two disagreeing is exactly the symptom.

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

The items render in a fixed-height data row above the combat row, which shadows
`--blacksmith-menubar-secondary-height` to its own height so the item subtree re-bases. Round and turn moved
into it as `info` items, so the combat row holds controls and portraits only and the endcaps are gone.

Two false starts are worth recording, because both were reverted and neither should be retried. The first
built a second row and moved the action buttons into it, shrinking them to fit; the buttons belong in the
scaling row and nothing about a fixed readout row requires moving them. The second put the items in the
single combat row beside the portraits, which is accurate but looks wrong: item sizing is pinned to bar
height, so at portrait scale the chips inflate into large squares and progress bars would become slabs.
The fixed row is the resolution — it was the right idea for the second reason, not the first.

Registration needed the same treatment as rendering: `registerSecondaryBarItem` rejected items for any
custom-template bar (`api-menubar.js:2040`) and now allows them for a hybrid one. `_secondaryBarStructureSignature`
also returned early for custom templates and skipped the item signature, so an item appearing or changing
visibility could not trigger a rebuild; hybrid bars now include both parts.

The endcap rework rode along, since it is the same markup: round and turn are one endcap on the left, and
the combatant-name endcap on the right is gone. Its label-above-value emphasis was inverted for the new
content, so the left endcap's two lines now read headline-above-detail.

Loose ends found during this phase that sit outside the phase list — the dead `timer-round.js` DOM cache
entries, the custom-template gate on secondary bar item clicks, the row height and font tuning, whether the
canvas-clearing actions hide during combat, and Quick Encounter's owner — are tracked in `TODO.md` under
"Combat bar (encounter bar merge)" so they outlive this plan.

**Phase 5 — Challenge Rating. Done.** Party CR, Monster CR, and Difficulty are registered as `info`
items in a `challenge` group, GM-gated, refreshed by the bar's own debounced
`createToken` / `updateToken` / `deleteToken` hooks rather than `EncounterToolbar`'s. Each item carries its
own label, so the values drop the redundant "CR". Landed early so the row had something real in it to
review — an empty row cannot be judged.

The CR pair now hides once combat starts, per the design-time/run-time split, with Difficulty staying in
both states. This waited for the balance bar to exist to take the space, since hiding them earlier would
only have left a gap.

**Phase 6 — Health. Done.** Party and monster health as `progressbar` items in a `health` group, party
visible to everyone and monster GM-only on the same reasoning as the challenge rating. Scoping follows what
the bar is answering: the canvas out of combat, matching the challenge rating, and the tracker in combat.

Built on the shared `getActorHP` from `utility-health.js` rather than a fourth private copy of the HP shape
lookup — `TODO.md` has an item to move the combat bar and party bar onto that helper, and this is its first
consumer.

**Linked tokens are counted once per actor.** Five goblins from an unlinked prototype are five HP pools, but
two tokens of one linked PC are a single pool, and summing per token would double that character's health.
The dedupe keys on actor id and applies only to linked tokens, which is why it cannot simply dedupe
everything: unlinked synthetic actors share the prototype's id.

Health follows `updateActor` and `updateToken` through the existing debounced readout refresh, not the
combat-bar HP handlers, which only fire for combatants — out of combat the readouts cover the canvas.

**Phase 7 — Balance and timers. Done.** One timer slot, two items: planning and
turn, mutually exclusive through their `visible` predicates, since planning hands off to the turn timer when
it expires and the two are never live at once. The round and total elapsed timers are deliberately NOT
included: they count up with no maximum, so they have no percentage to fill and belong as text chips rather
than bars — and they are not wanted yet.

**The display logic is shared, not reimplemented.** `PlanningTimer.getDisplayState()` and
`CombatTimer.getDisplayState()` return `{percent, state, text, isExpired}` and are the single source of
truth for every surface drawing that timer. Each previously computed the same thresholds and text in two or
three places; those are now one apiece. The band colours moved into custom properties declared beside the
tracker's own bar styles, and the combat bar's fill takes a state class instead of an inline colour, so one
set of values serves both surfaces. Note the two timers' text precedence genuinely differs — paused wins
over expired for the turn timer, the reverse for planning — and that difference is preserved rather than
normalised, because it is existing behaviour.

**Ticks write DOM; they do not re-render.** The timers tick every second, and routing that through
`updateSecondaryBarItemInfo` plus a menubar rebuild would rebuild the bar once a second for the whole of
every combat — the cost the menubar fingerprint exists to avoid, and the reason the tracker's own timers
write into cached DOM. The timers fire `blacksmithTimerDisplay` and the bar writes straight into the
rendered fill and label. Only transitions — pause, resume, expiry, handoff — trigger a rebuild, since those
change which item is visible, which is structural and the fingerprint has to see it.

Two details that would otherwise be discovered the hard way: the items are registered with non-empty labels
because the partial renders the label spans behind `{{#if}}`, and a span that never rendered cannot be
written to; and a hook rather than a direct call carries the tick, keeping the bar out of the timers' import
graph — `manager-combatbar` already imports both timer modules for their state, so a call back the other way
would close a cycle.

**Phase 8 — Retire the encounter bar.** Remove the `registerSecondaryBarType('encounter')` block and its
items, drop the encounter menubar tool, and relabel the merged bar. Identifiers stay as they are.

## Related work

`menubarCombatSize` did not resize the bar at all before this plan was written — the setting fed a variable
no CSS read, while the bar's height came from a value frozen at registration. That was fixed independently
and was a prerequisite for phase 3, since two sizes cannot work until one does.
