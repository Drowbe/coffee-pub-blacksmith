# Places: a Registry of Locations, Not a Property of Scenes

**Audience:** Us, while the work is in flight.

**Status: Proposed. Nothing implemented, and nothing should be until 13.22.0 ships** — see Sequencing.

This plan proposes inverting the geography model: a place becomes a record that exists on its own, and
a scene references one rather than carrying geography of its own. It supersedes nothing yet; the shipped
scene-flag model in `plan-scene-geography.md` remains correct and in use.

Internal. Plans never publish.

---

## The problem with what shipped

Scene geography works and is in production, but it has one structural limit: **geography cannot exist
without a scene**. The flag lives on the Scene document, so a place a GM has named but not yet built is
not representable. That inverts the actual ratio — a campaign has hundreds of named places and perhaps a
dozen scenes.

Three consequences follow, and all three are already visible:

- **No identity.** `realm/region/site/area` are free text per scene, so `Baldur's Gate` and
  `Baldurs Gate` are different places to anything that groups. Renaming a region leaves every scene
  stale with no migration path.
- **No grouping.** "What is in the Sword Coast" is a string match. Region-level reputation — the open
  question in `plan-scene-geography.md` — has nothing to aggregate over, which is why it stayed open.
- **No spatial relationship.** Containment is asserted by typing the same string twice. Distance and
  travel are not expressible at all.

The author's framing is the one that resolves it: **humans are visual and spatial.** A GM plots places on
a map, in advance, and builds scenes for the few they will actually run.

## The shape

**A place is a record. A pin is one view of it.** Settled 2026-08-31.

That distinction is the whole design. A place has a name, a parent, a habitat, a reputation, optionally a
Location journal and optionally a scene — none of which are pin concerns. And one place may want pins on
several maps: the same town on the continent map and on the regional map. If the place *is* the pin,
that is two places that will drift.

A scene then **references** a place rather than carrying geography, and `getGeography(scene)` resolves by
walking up from the scene's place to its parents. The seed model survives intact: an unset field still
inherits, from the parent place rather than from a world setting.

## Most of the machinery already exists

Surveyed 2026-08-31. The pins system is closer to a location registry than to a decoration layer:

| Requirement | Already provided by pins |
|---|---|
| Identity and coordinates | `{id, x, y, size, image, type, tags, ownership}` (`manager-pins.js:32`) |
| **Places with no scene** | **unplaced pins**, persisted in a world setting (`manager-pins.js:87`) |
| Change notification | `created`, `placed`, `unplaced`, `updated`, `deleted`, emitted via `Hooks.callAll` (`manager-pins.js:121`, `:1469`) |
| Per-module extension | type registry keyed `moduleId\|type` (`manager-pins.js:135`) |
| Player visibility | per-pin ownership, plus a `blacksmith.pins.resolveOwnership` hook (`:1802`) |
| Plotting on an image | journal-page pins, with a placement flow (`ui-journal-pins.js`) |

Two gaps this closes for free are worth naming, because they were open questions an hour before the
survey: **geography has no change-notification surface**, and **places cannot exist before scenes**. Pins
answer both, and neither needs building.

**No new canvas surface is required.** The parent map is a scene — a world map carrying location pins.
What does not exist yet is the *destination* scene. So "plot in advance" means the atlas scene exists and
its children are pins that may or may not have been built out. This is Foundry-native, inherits pin
ownership so player visibility is already solved, and needs no new rendering.

## Ownership: Blacksmith is the engine, Cartographer is the experience

This settles the open boundary question in `plan-scene-geography.md`.

- **Blacksmith owns** the place record, the parent relationship, the resolution rules, the vocabulary,
  and the API. Same argument that moved habitat here: a place is a fact about the world, not a feature
  of any one module, and several modules consume it. The pin layer is the seam and it is already ours.
- **Cartographer owns** the atlas: panning a map, revealing places as players explore, travel planning,
  browsing. That is presentation over data it does not own, which is exactly the split that worked for
  habitat.

The test for any new piece: if removing every sibling module would make it meaningless, it belongs to
Cartographer. If a place would still be a place, it belongs here.

## What this makes possible

Not motivation for its own sake — each of these is currently impossible, and that is the argument:

- Travel time between places, because coordinates become real
- "What is in this region" as a query rather than a string match
- Region-level reputation, dissolving an open question rather than answering it
- Habitat inherited from a region, so `Underdark` is set once rather than on forty scenes
- A player-facing map that reveals progressively, using ownership that already exists
- Recursive maps: a continent pin opens a regional map, whose pins open scenes

## Open questions

Three want settling before any code, and the first is the largest.

1. **What IS a place, as storage?** A Foundry document subtype, a JournalEntryPage subtype, or a
   world-setting record. This determines export, permissions, compendium round-trip and whether a place
   can be shared between worlds. A subtype gets Foundry's machinery free and costs a declared document
   type; a settings record is cheap and inherits none of it. **Note the precedent both ways:** habitat
   went onto a document flag precisely so it would travel with the scene, and reputation's off-document
   world-setting storage is a known defect being migrated away from.
2. **Do places nest arbitrarily, or stay four fixed levels?** Arbitrary nesting is the honest model of
   how places actually contain each other and makes resolution recursive. Four levels match everything
   shipped, every existing consumer, and the importer's fields. Arbitrary nesting is not obviously
   better and is certainly more expensive.
3. **Should Cartographer's session be in the design conversation before either side builds?** The
   habitat move worked because the consumer was consulted before the contract was fixed, not after.

## Sequencing

**Do not start before 13.22.0 ships.** Three reasons, and the second is decisive:

1. Workstream 3 of `plan-scene-geography.md` is mid-flight — Artificer's code is written and awaiting
   live verification, Minstrel is code-complete and verified.
2. **Both siblings are actively coding against the geography API right now.** This design changes the
   shape of that API. Moving a contract while two consumers are adopting it is the failure this whole
   effort has spent a day avoiding.
3. The habitat migration has not been verified against a world with real data. Building on an unverified
   migration compounds one risk with another.

Nothing here is urgent, and nothing here is blocked by waiting. The correct order is: ship 13.22.0,
verify the migration live, let the siblings settle, then design this with Cartographer in the room.

## Verification

There is no test framework, so each piece names its live check when it is scoped. Two are already known:

- A place with no scene survives a world reload and appears on its map — the property that motivates the
  whole design, and the one the current model cannot express at all.
- `getGeography(scene)` returns the same values through place resolution as it does today through the
  scene flag, for every scene that has both. That is the migration-correctness check, and it is the same
  standard the habitat migration was held to: evidence that only the new path could produce, not merely
  a non-empty result.
