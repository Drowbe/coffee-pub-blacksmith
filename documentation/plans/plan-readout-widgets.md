# Plan: Reusable Readout Widgets

**Status:** In progress — Phase 1 complete and verified live; its content has moved to `CHANGELOG.md`
and the section below is kept only as context for the phases that follow. Phases 2-4 planned.

**Outcome:** feature.

Turn the encounter bar's statistics from seventeen identical text chips into a small vocabulary of readout
widgets that differ by the shape of the data they carry, and make them live rather than static. The widgets
are registered on the secondary bar API, so they are available to every bar and to the sibling modules, not
only to the statistics group.

## Why the chips read as flat

Every statistic registers as `kind: 'info'`, which renders as icon plus text
(`templates/partials/menubar-secondary-default.hbs:109`). A rank, a quantity, a percentage, a person and an
all-time record therefore come out looking identical, and nothing about a chip says which it is.

The flatness is partly deliberate and partly a side effect. `styles/menubar-combatbar.css:160` strips fill,
border, radius, cursor and hover from every item in the data row, for a stated and correct reason: on a
default bar every item is a button, and that chrome on a readout offers an affordance that does nothing.
What it also removed was every means of telling one readout from another. The distinction the widgets
restore is identity, not affordance: tint, weight and shape come back; the pointer cursor and the hover
lift do not.

The second constraint is space. Ten lifetime chips and seven live ones already exceed the middle zone, and
`CombatBarManager.READOUT_SUPPRESSION_ORDER` decides which survive a given width. A widget that is merely
prettier is also wider, and pushes more statistics into suppression. So each widget below has to justify
itself as either carrying more meaning in the same width, or replacing several chips with one.

## The blocker: a value change rebuilds the whole menubar

`MenuBarAPI.updateSecondaryBarItemInfo` ends in `this.renderMenubar(true)` (`scripts/api-menubar.js:2308`) —
immediate, bypassing the 50ms debounce at `:3228`. The new value lands in `secondaryBarInfoUpdates`, which
`_secondaryBarLiveContentSignature()` (`:3120`) folds into the menubar fingerprint, so the fingerprint always
differs and the menubar DOM is destroyed and rebuilt in full.

`CombatBarManager.refreshStatReadouts` issues **18** of those calls in sequence, so one statistics refresh
currently costs eighteen immediate full-menubar rebuilds.

This matters twice over. It is a real cost on a bar that section 9B of `architecture-blacksmith.md` calls
performance-critical. And it makes animation impossible in principle: a node destroyed and recreated on
every value change cannot run a CSS transition that means anything, a keyframe flash would replay on every
unrelated rebuild rather than on a change, and a count-up would restart continuously.

So **Phase 1 is not a widget.** It is a targeted value-patch path, and nothing else in this plan works
without it.

## Phase 1 — patch values in place

Add a value-refresh path beside the existing `_applyMenubarLightweightRefresh` (`:3197`), which already
establishes the pattern for the primary bar: when the structure signature is unchanged and only live values
differ, patch the existing DOM instead of rebuilding.

- Split the fingerprint. `_secondaryBarStructureSignature()` already exists and covers which items are
  present and visible; `_secondaryBarLiveContentSignature()` covers their values. Only the former should
  force a rebuild. A change confined to the latter takes the patch path.
- `_applySecondaryBarValueRefresh(templateData, rootEl)` walks `secondaryBarInfoUpdates` for the open bar
  and writes into `[data-item-id]` nodes: value and label text, tooltip and title attributes, portrait
  `src`, icon class and colour, and the widget-specific geometry Phases 2 and 3 add.
- Batch the write. Give `updateSecondaryBarItemInfo` an internal coalescing path so eighteen sequential
  calls schedule one refresh rather than eighteen, on the same 50ms debounce the render already uses. The
  public signature does not change; callers keep calling it once per item.

The patch path is what lets a widget compare its previous value to its new one, which is the whole basis of
the motion in Phase 4.

Verify live: open a world with combat history, start a combat, and confirm the statistics update as they do
now. With `globalDebugMode` on, confirm one refresh logs one render rather than eighteen. Confirm that
changing combat state — which changes which items are visible, a structure change — still rebuilds.

## Phase 2 — the three identity widgets

New kinds on `registerSecondaryBarItem` (`scripts/api-menubar.js:2050`), validated alongside `info`,
`progressbar` and `balancebar`, rendered in `menubar-secondary-default.hbs`, styled in a new
`styles/menubar-widgets.css`. That file needs an `@import` in `styles/default.css` beside line 61 or it is
silently unstyled.

**`statchip`** — supersedes `info` for readouts rather than replacing it; `info` stays for anything that is
genuinely just a label. Adds a `tone` (`neutral`, `good`, `bad`, `record`) which drives an accent applied to
the value and a hairline, not a filled button background. Costs no width.

**`portraitstat`** — face, value badge, and a rank ring. This formalizes what the standings chips already do
by hand: they pass an `image` to an `info` item and rely on two overrides in `menubar-combatbar.css:208` to
undo the button treatment. As a widget the portrait is round, the value sits as a corner badge rather than
beside the face, and rank drives the ring colour. The reason for a portrait at all is unchanged and stated
in `architecture-encounter.md`: a face is recognised where a truncated first name is not.

**`gaugechip`** — a small radial arc for a percentage, with the number inside it. Hit rate and average hit
rate become shapes that read before the digits do, at roughly the width the text already occupies.

Verify live: register one of each on the combat bar, confirm they render at both bar heights (the data row
and the combat tracker row re-base the sizing variables — `menubar-combatbar.css:85`), and confirm they
carry no pointer cursor or hover lift.

## Phase 3 — the two consolidating widgets

**`segmentchip`** — one compact bar divided proportionally, with the breakdown in the tooltip. Hits, misses,
criticals and fumbles become a single item that shows composition, which four separate numbers never did.
This is the widget that buys back the width Phase 2 spends.

**`sparkchip`** — a value with an inline sparkline behind it. The series data already exists on every client
and needs no new tracking:

- In combat, `combatStats.rounds[]` (`stats-combat.js:2631`) holds per-round summaries and is mirrored to
  the combat flag, so damage per round is available to every client through the same read path the running
  totals already use.
- Out of combat, the `combatHistory` world setting holds every combat summary with its `totals`.
  `PartyStats._build` reduces that array to scalars today (`stats-party.js:143`); adding a short series
  alongside the scalars is an addition to the same single reduction, not a second one.

That last point is the constraint to hold: the bar must keep reducing nothing itself. A series added to the
aggregate is shared with the Party Statistics window like every other figure.

Verify live: fight a three-round combat and confirm the in-combat sparkline gains a point per round; end it
and confirm the out-of-combat sparkline gains a point per combat. Confirm a cold world with no history
renders an empty widget rather than a broken one.

## Phase 4 — motion

Full motion, in and out of combat. All of it depends on Phase 1, because all of it is driven by a widget
comparing its previous value to its new one on a node that survived the update.

- Value flash on change, tone-coloured: green for a rise in something good, red for a rise in damage taken.
- Count-up between old and new value for numbers, short enough not to lag the real figure.
- Record burst: when a chip's value passes the standing record mid-combat, it flares. This is a `statchip`
  state rather than a sixth widget, so it costs a class and a keyframe, not an API surface.
- Portrait swap crossfade, so a change of who holds a standing is legible rather than instant.

Two things to respect. Motion must be driven by an actual value change, never by a render, or it will fire
constantly. And `prefers-reduced-motion` should collapse every animation to a plain value swap.

Verify live: land a hit and confirm the damage chip counts up and flashes; take damage and confirm the
damage-taken chip flashes in the other tone; beat a standing record and confirm exactly one burst.

## Where this does not go

The rotator chip — one slot cycling several statistics on a timer — is the honest answer to "seventeen chips,
room for six", and is deliberately out of scope here. It needs a setting and a decision about motion in
peripheral vision during a fight, and it should not ride along with the widget vocabulary.

The widgets are menubar API, not statistics code. `manager-combatbar.js` becomes a consumer that picks a
widget per statistic; it gains no rendering of its own. Once the vocabulary exists, the Party Statistics
window and the statistics chat cards are the same grid-of-boxes problem and can adopt it — but that is a
later change, not this one.

## On completion

Distribute and delete this file. The widget kinds and their options belong in `documentation/api/api-menubar.md`;
the value-patch path and the reasoning about identity versus affordance belong in
`documentation/architecture/architecture-menubar.md`; which statistic uses which widget belongs in the Party
statistics section of `documentation/architecture/architecture-encounter.md`; the history belongs in
`CHANGELOG.md`.
