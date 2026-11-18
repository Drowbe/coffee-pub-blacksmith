# Architecture -- NPC Scaling

**Audience:** contributors to the Blacksmith codebase.

How an NPC is scaled into a stronger or weaker copy of itself, and the dnd5e facts the design rests on.
The public surface is in `api/api-npc-scaling.md`; this document covers the mechanism and the reasons.

Source:

| File | Role |
|---|---|
| `scripts/utility-npc-scaling.js` | The engine. Pure functions, no imports, no Foundry globals |
| `scripts/manager-npc-scaling.js` | `NpcScalingManager`: resolves a target, reads a snapshot, writes the new actor |
| `scripts/manager-npc-scaling-guidelines.js` | `NpcScalingGuidelines`: which table scaling reads (bundled, or the one built from a compendium) |
| `scripts/manager-npc-scaling-templates.js` | `NpcScalingTemplates`: the template library in a world setting, with export and import |
| `scripts/api-npc-scaling.js` | `NpcScalingAPI`, bound to `api.npcScaling` |
| `scripts/window-npc-scaling.js` | `NpcScalingWindow` (Tool window) and the entry points |
| `styles/window-npc-scaling.css` | Layout for the window; the controls are the shared `blacksmith-tool-*` set |
| `tools/check-npc-scaling.mjs` | Runs the engine under Node and holds its invariants |
| `testing/suites/suite-npc-scaling.js` | The in-Foundry suite: real fields, real actors |

## The split, and why it is there

Everything that decides what a scaling DOES is in the engine, as functions of plain data: a **snapshot**
(what the creature is now), a **spec** (what to change), and the **plan** `applySpec` returns (update data
plus preview rows). The manager is the only layer that touches a document. The reason is verification:
the engine imports nothing, so `tools/check-npc-scaling.mjs` imports it and runs it under Node, and the part
that matters most is the part that can be tested without Foundry. A line in the check fails the file if it
gains an import or reads `game`, `foundry`, `canvas`, `ui`, `Hooks`, `CONFIG`, `Actor` or `ChatMessage`.

A **spec** is serialisable and names no document, so it can be previewed, stored, exported and applied
without change. Two things make one: `specFromCR` (a CR retarget) and `specFromTemplate` (a saved template
with its numbers written in). Both feed `applySpec`, so there is one write path.

## What `specFromCR` does

Each amount is the **difference between two guideline rows**, added to the creature's own figure:

| Stat | Amount |
|---|---|
| Hit points | `{ mode: 'delta', value: row(target).hp - row(current).hp }`, on top of the creature's own maximum |
| Armor class | `row(target).ac - row(current).ac` |
| Attack bonus | `(atk gap) - (proficiency change)` |
| Spell save DC | `(dc gap) - (proficiency change)` |
| Damage | `round((own dpr + dpr gap) / attacksAfter - own hit)` added to the strongest hit, and carried by `attacksAfter` attacks |
| Attacks | `max(current, attacksForCR(target))` on a retarget UP only; none sideways or down |

The guidelines table is lopsided at low CR: a goblin has 7 hit points against a CR 1/4 row of 36 to 49.
Writing the target row's value would lift a weak creature onto the curve and make every creature of a CR
the same. Taking the gap keeps the creature where it sat relative to its own CR. The table is the DMG 2014
guidelines (`GUIDELINES`), a frozen object keyed by CR; every function that reads it takes the table as a
parameter. The 2024 books publish no equivalent table (the 2024 DMG budgets encounters by XP and carries no
monster statistics by CR), so there is no official 2024 set to ship; a world builds one from a compendium
instead (next section).

## The guidelines table, built from creatures

`buildTable(samples)` (engine) turns a list of creatures into a table; `NpcScalingManager.sampleCompendium`
reads the creatures; `NpcScalingGuidelines` stores the choice. Reading an installed bestiary is the only 2024
source that can be audited and regenerated, and it works for any pack, a homebrew one included.

- **A sample** is `{ cr, ac, hp, atk, dpr, dc }`, taken from the same `snapshot` a preview uses, so a
  table row means what the window's "Now" column means. `dc` is the highest of the creature's spell DC and
  its save activities' DCs. A figure a creature lacks is `null` or zero and counts for nothing: a creature
  with no attack still counts for armor class and hit points.
- **Typical is the median**, so one outlier does not drag a row. Hit points and damage carry a band of half
  the interquartile range each side, centred on the median, because the engine reads the midpoint of a range.
- **Sparse CRs are interpolated, and say so.** Fewer than `minSamples` (2) creatures at a CR and its row is
  drawn between its populated neighbours (the ends copy the nearest); its few creatures are ignored for that
  row. The report marks it `interpolated`, so a guess is never shown as a measurement.
- **Columns are smoothed to never fall as CR rises**, by the closest non-decreasing fit (weighted
  pool-adjacent-violators). Real stat blocks are noisy and a falling row would scale a creature down while the
  preview read fine. A row the fit moved by more than rounding is marked `smoothed`.
- **`validateTable`** is the gate: a row for every CR and none extra, finite numbers, ranges the right way
  round, nothing falling. It runs on a stored table on every read, and on `setGuidelines`. A stored table
  that fails is not used, and scaling falls back to the bundled one and logs it, so a hand-corrupted setting
  cannot silently invert a scaling.

The table is one `config: false` world setting that is empty for "use the bundled table". The window's
**Guidelines** button opens a dialog to build or reset: pick actor compendiums (preselected from the ones the
GM already chose for monsters in the compendium settings, else the system's 2024 pack), watch a progress bar,
then see the built table beside the one in use, estimated rows shaded, and keep it only on **Use This Table**.
Sampling loads every document in the chosen packs, so it is a few seconds for a bestiary; it yields to the
browser every twenty creatures and reports progress.

Initiative is not scaled: the guidelines have no column for it. A spec can still carry `initiative.add`.

## Templates

A template is the same change as a CR retarget, with the numbers written in instead of read off two rows.
It is **portable on purpose**, so it means the same on a goblin and on a dragon, and that decides its shape:

- **Hit points are a percentage** of the creature's own maximum (or a flat amount, by choice). A CR retarget
  saved as a template has its hit point gap converted to a percentage of the creature it was made for, which
  is why the ceiling is 10000%: a 7 hit point goblin taken to CR 12 is +2857%.
- **Attack bonus and save DC are totals**, what the sheet will show change. `specFromTemplate` subtracts the
  proficiency change that the template's CR step causes, exactly as `specFromCR` does, so the preview and
  the sheet agree. `templateFromSpec` adds it back when a spec is saved, and the check holds that the two
  are inverses.
- **The CR change is a step** (`crBy`), resolved against the creature's own CR by `shiftCR`. Above CR 1 it is
  exact; below, it snaps to a CR the table has a row for, so a step never produces CR 2.25.
- **Damage is per hit**, added to every weapon and spell attack. A CR retarget spreads a damage gap across
  the attack count; a template says the number outright.

`normalizeTemplate` is the one gate: it clamps every number, defaults the hit point mode and refuses a
template with no name, and it runs on every read from the setting, on save, and on import, so a hand-edited
file cannot put an out-of-range number on a sheet.

**Storage** (`NpcScalingTemplates`) copies the Quick Rolls library: a world-scoped, `config: false` setting
holding the list, and a second setting recording that the built-ins have been planted. `all()` returns the
built-ins until something is written, and the first write sets the flag, so there is no ready-time seed to
order, and a library a GM emptied on purpose stays empty. The built-ins have fixed ids (`tpl-elite`), so an
export imported into another world updates them rather than duplicating them. Import merges by id; replace is
asked for, never assumed. The file is an envelope (`type`, `version`, `templates`) so it cannot be mistaken
for any other JSON array.

**The window** adds a Scale-by switch (challenge rating or template). In template mode the library is a row
of selectable chips with new, edit, delete, export and import beside it, and one dialog (`api.dialog.prompt`)
serves new and edit: a new template starts from whatever the window is previewing, so a CR retarget worth
keeping is one dialog from being a template. The dialog's validator rejects a duplicate name. The name suffix
follows the chosen template until the GM types one.

## Damage and attacks, written into the actions

The first version held damage as an actor-level bonus (`rolls.damage.<t>.bonus`). That reads wrongly on the
sheet (the Bite still says `1` while +29 is added at roll time), reaches only weapon and spell attack
rolls (a breath weapon never scaled), and puts all of a CR jump on one hit. Because the output is a NEW actor,
its items are ours to write, so the engine now writes damage into them.

- **`NpcScalingManager._damageParts(actor)`** lists every damage part of the creature's non-spell attack,
  save and damage activities, each with where it is STORED. The prepared `activity.damage.parts` has the
  weapon's base damage unshifted onto the front (`part.base`), which is not in the stored array, so a base
  part's path is `system.damage.base` and every other part's index is the prepared index minus the number
  of base parts. A base shared by several activities of one item is listed once. Healing is skipped.
- **`scaleDamagePart(data, avg, addAvg)`** (engine) is the one place a formula is rewritten. Whole dice of
  the part's own die first, remainder into the flat `bonus`, a floor of one die and one average damage when
  scaling down, d6s for a part with no dice, the amount appended to a custom formula that does not start
  with dice. `scaleParts` gives each part `avg * (addPerHit / strongestHit)`, so parts grow by one ratio.
- **`applySpec` returns `itemEdits`** (`{ itemId, path, set }`), and writes the actor-level bonus ONLY as a
  fallback: when the creature has no known hit to measure against, or no part to write to. The preview says
  which happened. The manager applies edits to the copy's `items` with `setProperty`.
- **Attacks.** `attacksForCR` (1 / 2 / 3 / 4 at CR 3, 8, 16) is a starting point, applied on a retarget up
  only, so a same-CR retarget is still a no-op. `spec.attacks = { from, to }` is present only when the count
  rises. The damage per round is then shared across them; `describeMultiattack` writes the text.
- **Multiattack** (`_applyMultiattack`) appends a paragraph to an existing feature, never rewriting it: its
  prose names which attacks go in which order, so a swapped count would contradict it. With none it asks
  `api.compendiums.resolveDocument('Multiattack', 'feature', { exact: true })`, the GM's own feature
  compendiums, and uses what it finds as the base of a new item; with none, a plain feature. Nothing
  depends on the lookup succeeding.
- **Spells are left alone.** A spell's damage is its own and scales with its own mechanism, so a creature
  whose only damage is spells falls back to the bonus path.

## Scene guidance: which CR to choose

Nothing in the numbers says what rating a creature should become; that depends on the table. The window
reads it from the scene.

- **`NpcScalingManager.guidance(target, { cr })`** reads `EncounterManager.getPartyCR` and `getMonsterCR`
  (standing creatures only, with the creature's own token left out of the monsters when it is a token) and
  hands them to the engine's **`suggestCR`** with `EncounterManager.calculateEncounterDifficulty` as the
  rule. Blacksmith is consumer zero of its own encounter figures: the combat bar, the journal toolbar and this
  window can never disagree about what Hard means.
- **The engine holds no thresholds.** `suggestCR` is given the rule as a function and walks the CR ladder
  asking it, grouping the answers into one run per difficulty. Monster CR is a sum, so the creature's CR is
  added to the others' at each step. A change to the encounter rule changes the bands with no edit here.
- **It is advice.** `plan` and `apply` never read it, and the first render still offers four above the
  creature's own. In CR mode a band is a selectable chip that sets the CR to the band's lowest rating; in
  Template mode the template decides the rating, so the bands are shown and the line says where it lands.
- **A failure never costs the window.** A guidance error is logged and the section is omitted.
- **Scaling from the sidebar** is not subtracted from the scene, since it is not on it.

## The dnd5e facts it relies on

Verified against dnd5e **6.0.6**, by symbol. The line-number form of a citation is scanned by
`tools/check-dnd5e-citations.mjs` against the release it was last verified on, so none is written here.

1. **Proficiency is derived from CR.** `NPCData.prepareBaseData` sets `attributes.prof` to
   `Proficiency.calculateMod(max(cr, level, 1))`, which is `floor((n + 7) / 4)`. Writing `details.cr`
   moves attack bonus and save DC by itself, so `specFromCR` subtracts the proficiency change from both.
   An explicit spec's `attack.add` and `saveDC.add` are written as given, on top of the CR effect, and the
   preview shows the totals. `proficiencyForCR` mirrors the system's formula, and the check compares it
   with itself, so a dnd5e release that changes the formula is a re-read, not a re-run.
2. **CR also drives XP and spellcaster level**, in the same method. A scaled NPC's XP is right with no
   further write, and `manager-xp.js` and `EncounterManager.getMonsterCR` read `details.cr`, so it is
   counted at its new CR everywhere.
3. **Attack, damage and initiative bonuses moved between versions.** The system's own active-effect key
   migration table gives both layouts:

   | Stat | dnd5e 5.x | dnd5e 6.0 |
   |---|---|---|
   | attack bonus, per type | `system.bonuses.<t>.attack` | `system.rolls.attack.<t>.bonus` |
   | damage bonus, per type | `system.bonuses.<t>.damage` | `system.rolls.damage.<t>.bonus` |
   | initiative bonus | `system.attributes.init.bonus` | `system.attributes.init.roll.bonus` |
   | spell save DC bonus | `system.bonuses.spell.dc` | `system.bonuses.spell.dc` |

   `<t>` is each of `mwak`, `rwak`, `msak`, `rsak`. All are **formula strings**, so a write merges into what
   is stored (`"1"` plus 3 is `"1 + 3"`, via `addToFormula`) and never replaces it. The engine takes a
   `has(path)` predicate and writes to the first candidate in `PATHS` the actor's schema has. When none
   exists it throws `NO_PATH` rather than write a key dnd5e would drop without a word. The 6.0 column is
   verified on 6.0.6; the 5.x column comes from the migration table and is checked on a 5.x world by the
   `paths` check in the suite.
4. **An NPC stores `hp.max` and `hp.value`.** `hp.bonuses.overall` exists on characters only
   (`CharacterData`); `NPCData` has `hp.formula`, which is informational and which the engine leaves alone,
   so a scaled actor's formula can still read its old dice while `hp.max` is the real figure.
5. **Armor class has no persisted bonus.** `ac.bonus` is `persisted: false`, a field for active effects to
   feed, and `ac.calc` is no longer stored. On 6.0 the engine writes `attributes.ac.override`; where that
   field is absent (5.x) it writes `calc: 'flat'` and `flat`. Either way the scaled AC is a fixed number
   that no longer follows equipment, and the preview row says so.
6. **Fixed save DCs do not follow.** An activity whose DC is a stored number (a breath weapon) is touched
   by neither `bonuses.spell.dc` nor the proficiency change. Only spell DCs are scaled, and the preview
   says it.
7. **Unlinked tokens report the prototype's id and name** (`global/global-token-actor-identity.md`).
   Windows are keyed on the token's `uuid`, never on `actor.id`, and a token is read through its own actor
   so its unlinked changes are what the preview describes.

## The manager

**`resolve(target)`** accepts an actor, a token placeable, a token document or a UUID, and refuses with
`NOT_GM`, `NO_TARGET` or `NOT_NPC`. If the actor carries a provenance flag, it returns the flag's source,
so scaling a scaled creature starts from the original and scalings never stack. When the source no longer
exists it logs and scales the actor itself.

**`snapshot(actor)`** reads the prepared values a person would compare a preview against. The figures that
need a guess are the attack count and damage: each attack activity's damage parts are evaluated at their
minimum and maximum and averaged, and the count is read from a Multiattack feature only when its text says
so plainly (`parseMultiattackCount`: "makes two attacks"; anything else is `null`, so one attack). The
window shows the count as an editable number, because it is what the damage bonus is spread across, so a
bad guess is visible and correctable before anything is written.

**`apply`** copies `read.toObject()` (a token's actor includes its unlinked changes), writes the engine's
updates with `setProperty`, sets the name and the prototype token's name, clears `folder` when the source
is in a compendium, and attaches the provenance flag **in the same `create` call**, so a scaled actor never
exists for a moment without saying what it came from. It then fires `blacksmith.npcScaling.applied`. The
source is never written.

### Provenance

```
flags.coffee-pub-blacksmith.npcScaling = { sourceUuid, spec, template, version, appliedAt, crFrom, crTo }
```

`template` is the id of the template that made it, or `null`. One key, written once. Rescale and revert are both "regenerate from `sourceUuid`", so no backup exists to
go stale or be partially overwritten. A spec of another `version` is refused.

## The window

`NpcScalingWindow extends BlacksmithToolWindowBaseV2`, opened with `openFor(target)`: one window per
creature, keyed on `uuid`, with a distinct `id` per instance and `rememberPosition: false` because several
can be open. It builds its body as markup from the shared `blacksmith-tool-*` controls (a `section` per
group, a native `select` for the CR, `blacksmith-tool-editable` for the name suffix and the attack count)
and carries only layout CSS of its own. A change in the select or an editable re-plans and re-renders; the
create button is the one write.

Entry points, all through public registration surfaces: the window registry
(`registerWindow('blacksmith-npc-scaling')`), a `gmOnly` toolbar tool in the `gmtools` zone that opens for
the first selected NPC token, and a header control on every NPC sheet, added through `HookManager` on the
ApplicationV2 `getHeaderControlsActorSheetV2` hook. The V1 `getActorSheetHeaderButtons` never fires on v13.

## What this deliberately does not do

- It never writes the source. A scaled actor is a new document.
- It does not touch the SOURCE's items. The new actor's attacks are rewritten (see Damage and attacks); the
  source's stay as they were.
- It does not rewrite spell damage. A spell's damage belongs to the spell and its own scaling.
- It does not pick the target CR from the party. `getPartyCR` is a sum across the party for encounter
  budgeting, not a per-creature rating; it informs the bands the window offers (Scene guidance), and the GM
  chooses.
- It reads no other module's settings and needs none: every path above is core dnd5e.

## Invariants the check holds

`tools/check-npc-scaling.mjs`: the table is whole, ordered and frozen; a CR retarget subtracts the
proficiency change; amounts are row gaps and not row values; formula bonuses merge; paths resolve for both
layouts and refuse by name when neither exists; nothing is mutated; CR 0, a fractional CR and a retarget
down all work; the file imports nothing and reads no Foundry global. For templates: the built-ins are whole,
frozen, uniquely named and identified; `shiftCR` always lands on a CR with a row; normalising clamps and
refuses a nameless template; a template's attack and DC are net of the proficiency its CR step causes; a spec
saved as a template and applied back to the same creature is the identity; and the same template scales a
different creature by its own hit points. For the table: the bundled one is sound; `validateTable` catches
a falling column, a missing row, a backwards range and a CR off the ladder; a table built from the bundled
table's own midpoints is that table; the median ignores an outlier; a creature with no attacks is counted but
does not drag attack or damage; a sparse CR is interpolated and reported; the top end copies its neighbour;
noise is smoothed and the row it hit is reported; a built table is deeply frozen and never mutates its input;
nothing usable is refused by name. For actions: dice grow before the flat bonus, a die-less part is given d6s,
a custom formula keeps its tail, scaling down keeps one die and one average damage, parts grow by one ratio, damage
is written into parts and not the bonus when there is a hit to measure, attacks rise only on a retarget up,
and the Multiattack text names the count.
