# Equip Locations

**Audience:** someone changing the equip-location classifier, or building a consumer against it.

How Blacksmith decides where on a character an item goes, why the boundary sits where it does, and the
dnd5e data the rules rest on. The public surface is
[api-equiplocations.md](../api/api-equiplocations.md).

---

## Why this exists here

**dnd5e has no body-slot concept at all.** `DND5E.miscEquipmentTypes` is
`clothing|ring|rod|trinket|vehicle|wand|wondrous` and no field anywhere says a helm goes on the head.
A character build tool, a paper-doll UI, an inventory visualiser, and an importer that auto-equips all
need that answer and none can get it from the system, so each grows its own guesser.

Squire had one. Leaving it there would have made a satellite a dependency of the hub and of its
siblings: Vault, Merchant, Monarch and Blacksmith's own importer would each have to ask Squire for a
slot answer. That is the coupling the boundary rule exists to prevent, running backwards.

It is not a feature. No UI, no workflow, no per-actor state, no sockets -- a frozen table and a pure
function, the same shape as the tags system and `utility-compendium-types.js`. It also sits on dnd5e
item semantics the hub already owns: `PHYSICAL_TYPES` and the equipped/attuned reset set in
`api-inventory.js:31`, `weaponProperties` in `declarations/declaration-item.js:256`, and rarity in
`manager-compendiums.js:1639`.

---

## The boundary

**Blacksmith answers where on the body. The consumer owns which slot.**

| Blacksmith | The consumer |
|---|---|
| Which location an item could occupy | Which slot it is placed in |
| The taxonomy and its vocabulary | The layout, and how many of each slot exists |
| Handedness as a 5e fact | Whether a shield blocks the off hand |
| Nothing persisted | Its own stored placements |

Squire's layout has `spell1..3`, `sheath`, `hip1/hip2`, `ring1/ring2` and `bothhands`, in caster and
martial variants. Those are doll positions in one window. Returning them would hand every other module
that window's opinions, and Squire adding a fourth quick-cast position would become a Blacksmith
release.

The test that the line is drawn correctly: **Squire's `sheath` needs no taxonomy value.** It falls out
of `grip: 'off'`, so the shared contract never has to know it exists.

**The word "slot" does not appear in the contract**, and `held` is named apart from `hands` for the
same reason -- see the API document.

---

## The files

| File | Holds |
|---|---|
| `scripts/api-equip-locations.js` | The taxonomy, the structured and base-item tiers, `resolve()` |
| `scripts/utility-equip-vocabulary.js` | The ordered name-pattern table and its registration point |
| `tools/check-equip-locations.mjs` | The invariants, and the only executable test |

**These two source files import each other, and the vocabulary table is built lazily because of it.**
The API file needs the matcher; the vocabulary file needs the taxonomy. Building the table at
file-evaluation time throws a temporal-dead-zone `ReferenceError` on `LOCATIONS` whenever the API file
is evaluated first -- which is a load-order crash, not a runtime one. Deferring to first use keeps one
source of truth for the taxonomy rather than a second copy of the strings in the vocabulary file. Do
not "simplify" `builtIn()` into a file-level constant.

This is a cycle between two of Blacksmith's own files and nothing more. **No sibling module imports
anything from Blacksmith**, here or anywhere: a consumer reaches this at runtime through
`game.modules.get('coffee-pub-blacksmith').api.equipLocations`, which is the only coupling the suite
permits.

---

## The resolution ladder

Four tiers, first hit wins.

| Tier | Reads | Confidence |
|---|---|---|
| Structured | `item.type`, `system.type.value`, `system.properties`, `system.armor.value` | high |
| Base item | `system.type.baseItem` against `CONFIG.DND5E` registries | medium |
| Vocabulary | The item name, against an ordered pattern table | low |
| Unresolved | -- | `null` |

**The vocabulary tier is not gated by item type, and must not be.** An earlier draft reached it only
for `wondrous`, `trinket` and `clothing`, which gates the last resort on `system.type.value` -- the
very field whose unreliability creates the need for a last resort. A Cloak of Protection typed `loot`
matches no structured rule, and barring the vocabulary returns `null` with the word "cloak" sitting in
the name unread. `confidence` and `source` exist so a low-grade answer can be offered honestly rather
than withheld.

**Base-item lookups read `CONFIG.DND5E` at call time**, not at module load: a world may extend those
registries, and this module is imported during `init`. Only `shieldIds`, `armorIds` and `ammoIds` are
consulted -- a weapon's base item does not determine handedness, and the properties that do are on the
item the structured tier already read.

There is no override tier. Nothing persists an override, so the value would have no producer. A
world-scoped table ("in my world, holy symbols go on the belt") is a plausible future tier; `SOURCE`
is left open for it.

---

## Reading dnd5e items

**`system.properties` is an ARRAY in pack source and a Set on a prepared live document.** A resolver
calling only `.has()` breaks on compendium data; one calling only `.includes()` breaks on anything from
`actor.items`. Both shapes occur in normal use -- pack data when importing from a compendium, live
documents when reading an actor -- and the untested path is invisible until it runs.

```js
const props = item?.system?.properties;
return props?.has?.(key) ?? (Array.isArray(props) && props.includes(key));
```

This is `hasProperty()` in `api-equip-locations.js` and it is the only place properties are read.
Anything else in the suite reading item properties off both paths needs the same handling.

**`system.type.value` is absent far more often than expected.** A key existing in `CONFIG` is not the
same as content using it: `DND5E.equipmentTypes` has a first-class `ring`, yet a Ring of Fire
Resistance is typed `trinket`. Squire had to loosen a `ring` drop rule that refused it on those
grounds, and a "weapon or shield" rule that refused a torch in the off hand. That unreliability is the
reason the later tiers exist and the reason `confidence` is part of the contract.

**Compendium data cannot be grepped.** The pack `.ldb` blocks are Snappy-compressed. To read them:
`npm i classic-level` in a scratch directory, copy the pack folder (Foundry holds `LOCK`, so that one
file fails to copy and the rest succeed, harmlessly), then iterate with `valueEncoding: 'json'`.

---

## The weapon data the structured rules rest on

Read from the dnd5e 5.3.3 `items` and `equipment24` packs, which are byte-identical for every weapon
here. `items24` holds none of them. Read twice, independently, before the rules were written.

| Item | Subtype | Properties | Resolves to |
|---|---|---|---|
| Dagger | `simpleM` | `fin,lgt,thr` | `held` / `off` |
| Dart | `simpleR` | `fin,thr` | `held` / `main` |
| Greatsword | `martialM` | `hvy,two` | `held` / `both` |
| Hand Crossbow | `martialR` | `amm,lgt,lod` | `held` / `off` |
| Heavy Crossbow | `martialR` | `amm,hvy,lod,two` | `held` / `both` |
| Javelin | `simpleM` | `thr` | `held` / `main` |
| Light Crossbow | `simpleR` | `amm,lod,two` | `held` / `both` |
| Longbow | `martialR` | `amm,hvy,two` | `held` / `both` |
| Longsword | `martialM` | `ver` | `held` / `either`, versatile |
| Quarterstaff | `simpleM` | `ver` | `held` / `either`, versatile |
| Shortbow | `simpleR` | `amm,two` | `held` / `both` |
| Sling | `simpleR` | `amm` | `held` / `main` |
| Shield | `shield` | none | `held` / `off` |

Four things this data settles, each of which shaped a rule:

**Ranged-ness does not determine handedness.** All four two-handed ranged weapons carry `two` and are
caught by that rule. An earlier draft had a "subtype ends `R`" rule above the `lgt` check, which could
therefore only ever fire on one-handed ranged weapons -- reporting a Hand Crossbow (`amm,lgt,lod`, no
`two`) as two-handed. The rule was deleted rather than reordered.

**The weapon fallthrough is doing real work.** A Sling is `amm` alone: no `two`, no `lgt`. It reaches
the final weapon row and returns `held` / `main`. That row is not just catching melee.

**A shield carries no properties at all** and is identified solely by `system.type.value === 'shield'`.
That row is the only thing that can catch it, so it is not redundant with the armour row below it and
must not be merged into it. It is also checked *before* armour, because a shield carries
`system.armor.value` too.

**Versatile is a fact, not a decision.** A Longsword is `ver` with no `two`, so it is one-handed with
`versatile: true` and `grip: 'either'`. Whether it is actually wielded in two hands depends on what is
in the other hand, which is occupancy and therefore the consumer's. Quarterstaff proves this is a real
branch rather than a longsword special case.

**Natural, siege and improvised weapons resolve to `'none'` and must never be classified.** Squire had
to stop its build tool unequipping them and stop its drift check counting them, or every character with
claws read as permanently drifted.

**`rod` and `wand` deliberately have no structured rule.** An earlier draft resolved them to `held`
with no `grip`, which the contract does not allow, and it beat the vocabulary's `carried` purely by
sitting in tier 1 -- so a Wand of Magic Missiles (`equipment` / `wand`, `foc,mgc`) consumed a weapon
slot. A wand is stowed far more often than brandished.

---

## The vocabulary order is load-bearing

First match wins, so the table is a sequence and not a set. Three orderings encode defects found by
playing rather than by reasoning:

| Rule | Or else |
|---|---|
| `chest` first | a Robe of Eyes is worn on the face |
| `face` before `head` | "mask" lands on the head |
| `neck` before `carried` | a Necklace of Prayer Beads is carried, not worn |
| `waist` before `back` | a "belt pouch" becomes a backpack |
| `carried` last | "kit" beats a garment in the same name |

**`chest` leading a head-to-toe sequence is the one that looks wrong and is not.** `eyes` is in the
`face` pattern so that Eyes of the Eagle can be placed at all; a Robe of Eyes contains the same word
and is a garment. Nothing but order separates them.

### A field that reports a KIND is not a field that reports a LOCATION

**This is the mistake to know about before changing anything here.** It was made three separate times
during the first week of this module's life, each time by someone reasoning that a dnd5e field
"obviously" implied a place on the body. Each rule sat in tier 1, so each beat a better answer from a
lower tier, and each was confidently wrong rather than usefully silent.

| Deleted rule | The field says | It does not say |
|---|---|---|
| `rod`/`wand` -> `held` | it is a rod or a wand | whether it is brandished or stowed |
| `container` -> `back` | it holds other items | where the container sits |
| `clothing` -> `chest` | it is a garment | which part of the body it covers |

Every one of them now has **no structured rule at all**, and the name decides.

**`clothing` is the sharpest case, because the rule was wrong more often than right.** In the classic
`items` pack, Cloak of Protection, Cloak of Elvenkind, Cloak of Displacement, Boots of Speed and Hat of
Disguise are all `equipment` / `clothing`. A `clothing -> chest` rule was wrong for all five and right
only for Robe of the Archmagi and Robe of Eyes, by luck. It also sat above the vocabulary, so
`vocab:back` never saw the word "cloak" in a cloak's name. `equipment24` types those same items
`wondrous`, so the rule's correctness depended on which pack a world drew from -- which is itself
sufficient reason not to build a structured rule on the subtype.

Two consequences worth keeping:

**`system.armor.value` is tested for truthiness, not for presence.** Those `clothing` items carry
`armor: { value: 0 }`. Changing the test to `!== undefined` would send every cloak, hat and pair of
boots to the chest -- reintroducing the deleted rule through the back door.

**A word that names a container is not a word that names a location either.** `backpack`, `haversack`,
`knapsack` and `rucksack` say "back" in themselves and are in `back`. `pack`, `bag`, `sack`, `satchel`
and `quiver` say only "something portable" and are in `carried`. Bare `pack` was in the `back` list
once, and put a Fanny Pack of Holding between a character's shoulder blades.

So a Backpack is on the back, a Belt Pouch is at the waist, a Bag of Holding is carried, a Cloak of
Protection is on the back, Boots of Speed are on the feet, and an Oaken Strongbox is unplaced. The
words carry the location; the subtypes never did.

A reordering changes answers and looks like a tidy-up in review, which is why
`tools/check-equip-locations.mjs` asserts the order as a sequence and also as three behavioural cases,
so an insertion between them does not silently break one.

Registration takes a `position` for the same reason: appending to an ordered list is not extending it.
A pattern added after `vocab:carried` never fires if anything earlier matched.

Built-ins cannot be unregistered. A consumer that dislikes one registers a narrower pattern ahead of
it, which leaves the built-in table intact for every other consumer in the world.

---

## Placement order is the consumer's contract

Classifying well does not place well. The defect that prompted this work -- arrows assigned to a
character's head -- **was not a classification bug.** It was single-pass placement in item order: a
spare arrow took `neck` before an Amulet of Health was considered, so the amulet landed on the feet.
Squire fixed it with two passes.

A consumer doing single-pass placement will reproduce it however good this resolver is. Place specific,
high-confidence matches before general ones.

### A good classifier makes collisions the main failure mode

Once the vocabulary covers real content, "nobody knows where this goes" stops being the common reason
an item goes unplaced. **Slot collision takes over.** A character wearing Studded Leather and carrying
two robes has three items claiming `chest`; Amulet of Health beside a Necklace of Prayer Beads is two
claims on one neck. dnd5e will happily let a character equip two robes, and a body has one chest.

That is not a defect in the classifier or in the consumer, and **the API cannot help with it** -- which
slots exist and how many is a property of the layout, and what is already in one is occupancy. It is
the same boundary as the ordered-alternates decision, seen from the other side.

What it changes is the consumer's report. Two failures that read identically when rolled together:

| | Means | Say |
|---|---|---|
| Unknown | Nothing could place it | "Drag this in" |
| Crowded | It knew, and the slot was taken | "You own one neck" |

Squire found this after the vocabulary gaps were closed and split its report accordingly; rolled
together, the second reads as a bug in the first. Every consumer will meet it, and a consumer with a
smaller layout will meet it harder.

---

## What is deliberately absent

| Absent | Because |
|---|---|
| Persistence | Placement is consumer data. Squire stores builds -- slot-to-item inside several named plans, one item in three builds at different slots -- which a single per-item flag cannot express |
| Shared occupancy | Nothing asks what is on an actor's belt, and `system.equipped` is already the truth. A shared layer would invent a second one |
| Cardinality and blocking | Properties of a layout, not of an item. A shield returns `held` / `off` and blocks nothing |
| Ordered alternates | `grip` covers the weapon cases; a full `back` slot is occupancy. Watch this one: every consumer will write the container fallback privately, and if two write it differently the inconsistency will be reported against this API rather than against theirs |
| A reverse query | Cheap to add, but no consumer exists |
