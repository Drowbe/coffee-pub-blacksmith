# Equip Locations API

**Audience:** someone writing code that places an item on a character.

Answers "where on the body does this item go?" for a dnd5e item, as a generic location a consumer maps
to its own slots. How it decides, and why it is built this way, is in
[architecture-equiplocations.md](../architecture/architecture-equiplocations.md).

---

## The one rule

**An API that always returns a location recreates the bug it replaces.** When nothing can justify an
answer, `resolve()` returns `null`. A consumer must handle that rather than filling a slot with
whatever came back: twenty items imported with eight left unplaced is a better outcome than arrows
confidently placed on a character's head.

---

## Reaching it

```js
const api = game.modules.get('coffee-pub-blacksmith')?.api;
const where = api.equipLocations.resolve(item);
```

---

## resolve(item)

Synchronous and pure. Takes an `Item` document or plain item data from a compendium; returns a result
object. There is no batch form -- classify an inventory by mapping over it.

```js
const results = actor.items.map(item => ({ item, where: api.equipLocations.resolve(item) }));
```

| Field | Type | Meaning |
|---|---|---|
| `location` | string, `'none'`, or `null` | One of `LOCATIONS` below; `'none'` for something deliberately not body equipment; `null` when nothing could justify an answer |
| `grip` | string or `null` | `'main'`, `'off'`, `'both'`, `'either'`. Non-null only when `location` is `held` |
| `hands` | 1, 2, or `null` | Non-null only when `location` is `held` |
| `versatile` | boolean | Whether the item can be wielded one- or two-handed |
| `confidence` | `'high'`, `'medium'`, `'low'`, or `null` | How far to trust the answer |
| `source` | string or `null` | Which tier produced it: `'structured'`, `'baseItem'`, `'vocabulary'` |
| `matched` | string or `null` | The rule or pattern that fired, for example `weapon:two` or `vocab:head` |

**`grip` and `hands` are `null` for every location except `held`.** A consumer reading them
unconditionally will get `null` for a helmet, which is correct rather than missing.

### The two empty answers are different

| Value | Means | Show the player |
|---|---|---|
| `'none'` | Deliberately not body equipment -- a potion, a vehicle, a natural weapon | Nothing |
| `null` | Nothing could place it | That it needs placing by hand |

Collapsing them means re-guessing forever on items a player already dismissed, and being unable to
tell "unknown" from "not applicable" in an interface.

### What `source` means, and what it does not

`source` says **which tier answered**, not how good the answer is.

| `source` | Means |
|---|---|
| `structured` | A dnd5e field said so |
| `baseItem` | A dnd5e base-item registry said so |
| `vocabulary` | No dnd5e field said so, and the name did |

**`vocabulary` does not mean "suspect".** It is the *normal* path for whole categories of item,
because dnd5e's own content does not use its own subtypes consistently. Rings are the clearest case:
`DND5E.equipmentTypes` has a first-class `ring`, but published rings are routinely typed `trinket` --
Ring of Regeneration and Ring of Fire Resistance both are -- so they reach the vocabulary and match on
the word "ring", which is a dependable answer. The same holds for robes, which carry no armour value
and so have no structured signal at all.

A consumer that renders every `vocabulary` hit as "unconfirmed, please check" will mark most of a
character's rings unconfirmed, and people stop reading a marker that fires on everything. Use `source`
to explain a placement, and reserve any "check this" treatment for cases your own UI has a reason to
doubt.

`matched` names the rule rather than printing a regular expression, so "why did it pick that" is
answerable in an interface.

---

## isEquippable(item)

Convenience over `resolve()`. **Three-valued, deliberately.**

| Returns | Means |
|---|---|
| `true` | Body equipment |
| `false` | Deliberately not body equipment |
| `null` | Nobody knows |

```js
if (api.equipLocations.isEquippable(item) === false) return; // skip potions, silently
```

---

## LOCATIONS

The thirteen values `location` can take, frozen. Canon for the suite.

```
head  face  neck  back  chest  arms  hands  waist  feet
ring  held  ammunition  carried
```

Use the constants rather than string literals:

```js
const { LOCATIONS, GRIP, SOURCE } = api.equipLocations;
if (where.location === LOCATIONS.HELD && where.grip === GRIP.BOTH) { /* two-handed */ }
```

**`held` is where a weapon is wielded; `hands` is the body part gloves go on.** They are different
answers and were named apart on purpose -- an earlier draft used `hand` for the first, one letter from
the second, and a consumer writing the wrong one got silence rather than an error.

**There is no `belt`.** That location is `waist`.

### GRIP

| Value | Means |
|---|---|
| `'main'` | Main hand |
| `'off'` | Off hand -- a light weapon or a shield |
| `'both'` | Two-handed |
| `'either'` | Versatile: the consumer decides, because the answer depends on what is in the other hand |

**A shield returns `held` / `off` and blocks nothing.** Whether an off-hand weapon may coexist with a
shield is a rules decision this API does not make. Cardinality -- how many rings, whether two-handed
locks the off hand -- is a property of your layout, not of the item.

---

## Extending the vocabulary

The name-pattern table is the last resort, reached by anything the structured tiers could not place.
Register into it for homebrew or a non-English world.

```js
api.equipLocations.registerVocabulary({
    id: 'my-module:circlet',
    location: api.equipLocations.LOCATIONS.HEAD,
    pattern: /\bdiadème\b/i,
    position: 0
});
```

| Member | Does |
|---|---|
| `registerVocabulary({id, location, pattern, position})` | Adds a pattern. Returns whether it was registered |
| `unregisterVocabulary(id)` | Removes one of yours. Built-ins are refused |
| `getVocabulary()` | The ordered table, read-only |
| `resetVocabulary()` | Restores the built-ins |

**`position` matters and is not a convenience.** The table is ordered and first match wins, so a
pattern appended after `vocab:carried` never fires if anything earlier matches. Namespace `id` with
your module id; it is what `matched` reports back.

To override a built-in, register a narrower pattern ahead of it rather than removing it -- the
built-in table stays the same for every other consumer in the world.

---

## What this API does not do

| Not here | Because |
|---|---|
| Store where an item is placed | Placement is your data. This is a pure function of the item |
| Tell you what is currently equipped | `system.equipped` already does, and a second source of that truth would be a defect |
| Enforce cardinality or blocking | A property of your layout, not of the item |
| Return ordered alternates | If your `back` is full, the fallback is yours to choose |

**Placement order is your contract, not this API's.** Classifying well does not place well: a
single-pass placement in item order lets a spare arrow take the neck slot before an Amulet of Health
is considered. Place specific, high-confidence matches before general ones.
