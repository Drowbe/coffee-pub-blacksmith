# Architecture -- NPC Scaling

**Audience:** contributors to the Blacksmith codebase.

How an NPC is scaled into a stronger or weaker copy of itself, and the dnd5e facts the design rests on.
The public surface is in `api/api-npc-scaling.md`; this document covers the mechanism and the reasons.

Source:

| File | Role |
|---|---|
| `scripts/utility-npc-scaling.js` | The engine. Pure functions, no imports, no Foundry globals |
| `scripts/manager-npc-scaling.js` | `NpcScalingManager`: resolves a target, reads a snapshot, writes the new actor |
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
without change. Two things make one: `specFromCR` (a CR retarget) and, later, a saved template with its
numbers written in. Both feed `applySpec`, so there is one write path.

## What `specFromCR` does

Each amount is the **difference between two guideline rows**, added to the creature's own figure:

| Stat | Amount |
|---|---|
| Hit points | `{ mode: 'delta', value: row(target).hp - row(current).hp }`, on top of the creature's own maximum |
| Armor class | `row(target).ac - row(current).ac` |
| Attack bonus | `(atk gap) - (proficiency change)` |
| Spell save DC | `(dc gap) - (proficiency change)` |
| Damage | `round((dpr gap) / attacksPerRound)` added to every hit |

The guidelines table is lopsided at low CR: a goblin has 7 hit points against a CR 1/4 row of 36 to 49.
Writing the target row's value would lift a weak creature onto the curve and make every creature of a CR
the same. Taking the gap keeps the creature where it sat relative to its own CR. The table is the DMG 2014
guidelines (`GUIDELINES`), a frozen object keyed by CR; every function that reads it takes the table as a
parameter.

Initiative is not scaled: the guidelines have no column for it. A spec can still carry `initiative.add`.

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
flags.coffee-pub-blacksmith.npcScaling = { sourceUuid, spec, version, appliedAt, crFrom, crTo }
```

One key, written once. Rescale and revert are both "regenerate from `sourceUuid`", so no backup exists to
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
- It does not touch items or activities. Damage, attack and DC are actor-level bonuses, so the scaled
  actor's items are byte-for-byte the source's, and the change is visible on the sheet.
- It does not add attacks. A one-attack creature scaled far up carries its damage on that attack, and the
  engine warns (`DAMAGE_ON_ONE_ATTACK`) when the per-hit bonus is more than three times its own average hit.
- It does not use the party-CR function as a default target. `getPartyCR` is a sum across the party for
  encounter budgeting, not a per-creature rating.
- It reads no other module's settings and needs none: every path above is core dnd5e.

## Invariants the check holds

`tools/check-npc-scaling.mjs`: the table is whole, ordered and frozen; a CR retarget subtracts the
proficiency change; amounts are row gaps and not row values; formula bonuses merge; paths resolve for both
layouts and refuse by name when neither exists; nothing is mutated; CR 0, a fractional CR and a retarget
down all work; the file imports nothing and reads no Foundry global.
