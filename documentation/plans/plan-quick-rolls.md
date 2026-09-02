# Plan: Quick Rolls become a library

**Audience:** Contributors working on Request a Roll.

**Status: Built, unverified in Foundry.** The library, the Roll Builder, the migration and the row
controls are in. What has not happened: a live pass in a world, and the decision about which rolls ship
as defaults.

Scope: turn the QUICK tab's twenty-four hand-written rows into data a GM can add to, edit and delete,
and build the window that edits them. This plan is scaffolding — when it is verified its design goes to
`architecture/architecture-rolls.md`, its surface to `api/api-requestroll.md`, and this file is deleted.

## The problem

The QUICK tab was twenty-four `<div class="cpb-check-item" data-type="quick" …>` rows in
`templates/window-skillcheck.hbs`. A GM could not add one, change one, or remove one: the list was
whatever shipped. A table wanting "Athletics vs Acrobatics, DC 12, as a cinematic" assembled it by hand
every time it came up.

Two smaller things were wrong in the same place:

- **`data-value` held friendly names** (`perception`), translated by a ten-entry lookup inside
  `_handleQuickRollItem`. Any skill outside those ten silently did nothing — a quick roll for Arcana
  could never have worked, and nothing said so.
- **The lookups were hardcoded to `[data-type="skill"]`**, so an ability or save quick roll had no way
  to exist.

## Decisions taken

| | |
|---|---|
| Storage | **World** setting `requestRollQuickRolls`. This is the table's roll library, not one person's preferences: a second GM sees the same list and the rolls travel with the world. Favourites stay `user`, because a favourite is a personal shortcut to a shared thing. |
| Roll picker | **Skill, ability, save.** The three where a roll is fully described by a type and a CONFIG id. Tools are per-actor and dice are a whole formula; neither collapses to the two fields a quick roll stores. |
| Row controls | **Always visible.** Edit and delete before the heart, so the two that change the library are together and the two that fire or keep it are together. |
| Migration | Seed the same twenty-four, once, recorded by `requestRollQuickRollsSeeded`. |

## The shape

```
{ id, category, label, description, icon,
  mode: 'normal' | 'contested',
  targets: 'party' | 'selected',        // normal only
  success: 'individual' | 'group',      // normal only
  challenger: { type, value },
  defender: { type, value } | null,     // contested only
  dc: string | null,
  isCinematic, rollTitle }
```

`QuickRollsManager.normalize()` runs over every record on read, not just on write. These are
hand-editable world settings that outlive the shape that wrote them, and a missing field has to render
as a sane row rather than as `undefined` in a label.

## What made it safe

**The generated rows are the same shape the markup had, `data-*` for `data-*`.** Four things read that
dataset — `_handleQuickRollItem`, `_computeFavoriteId`, `_favoriteRecordFromItem`, and the search filter.
Emitting a different shape would have meant changing all four at once, and a favourite saved before the
change would no longer match the row it came from.

`node tools/check-quick-rolls.mjs` guards the two silent failures: an attribute the reader wants that the
writer does not set (every reader treats `undefined` as a legitimate "not set"), and a built-in roll lost
to a typo in the terse `flatMap` that builds them — which no existing world would report, because a world
seeds exactly once.

## Who rolls, in both modes

`targets` (`party` / `selected`) applies to a contest as well as a normal roll. For a normal roll it folds
into `data-roll-type` (`party` / `individual`), which is the vocabulary `_handleQuickRollItem` has always
spoken; a contest spends `rollType` on saying it is a contest, so the answer travels separately in
`data-targets` and the contested branch reads it.

`party` on a contest means the party are the CHALLENGERS and anything else already selected becomes the
defence. Anything unselected is left alone: the opposition is situational and the GM has just picked it.

This was the one attribute the migration lost. The contested branch touched no contestant at all, so a
saved contested roll fired against whatever was selected, or refused with "select at least one actor" —
indistinguishable from the GM forgetting to select anybody.

## The builder is a Tool window

`BlacksmithToolWindowBaseV2` rendering into the shared `templates/window-tool-template.hbs`, per
`documentation/api/api-window.md` — the contract for a small utility opened from an in-flow action. The
shell owns the root, the scrolling body, the footer, the theming, and every form control inside it; the
body template owns only its content and `styles/window-rollbuilder.css` carries **no colour literals**,
because the Tool surfaces are per-theme custom properties and any literal is right in one theme and wrong
in the other two.

Ephemeral, so it follows the documented rules for one: a distinct `id` per instance (two Application V2
windows sharing an id collide in the DOM) and `rememberPosition: false` (`windowPositionKey` defaults to
the class name, so siblings would overwrite each other's saved position). The theme still persists — that
is gated by its own flag.

The first version of this window did none of that: it extended the standard base, drew its own root, and
painted its own fields. It rendered, and it looked like a different module. `check-quick-rolls.mjs` now
fails on all four halves of that mistake.

## Portability

Export writes an envelope -- `{ type, version, exportedAt, world, rolls }` -- rather than a bare array, so
a reader can tell the file from the twenty other JSON arrays a Foundry user has lying around, and a future
format has somewhere to say so. `parseImport` accepts a bare array too, because that is what somebody
hand-assembling a file writes.

Import asks merge-or-replace rather than choosing. Merging matches on id, which is right in both
directions that matter: re-importing your own export updates rather than doubles, and two worlds carrying
the built-ins agree about them, because those ids are derived from what the roll is (`qr-party-prc-group`)
rather than generated per world.

## Not done

- **Which rolls ship as defaults.** All twenty-four do today. The seed flag means this can change later
  without stepping on anything a table has built.
- **Reordering.** Categories render in first-seen order and rolls in insertion order. There is no way to
  move one.
- **Tool and dice quick rolls.** See the picker decision above.
- **A live verification pass.** Nothing here has been run in a world.
