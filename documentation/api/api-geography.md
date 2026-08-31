# Geography API

**Audience:** Developers reading or writing what Blacksmith knows about a scene as a place.

Covers scene geography, the canonical habitat vocabulary, and how a scene's own values resolve
against the campaign defaults. Implementation lives in `scripts/manager-geography.js`.

---

## Overview

Blacksmith stores four location fields, an habitat list, a reputation value and an optional link to
a Location journal on the Scene document, under the flag `coffee-pub-blacksmith.geography`.

```js
const blacksmith = game.modules.get('coffee-pub-blacksmith')?.api;

blacksmith.geography.get(canvas.scene);            // {realm, region, site, area}, resolved
blacksmith.geography.getHabitats(canvas.scene); // ['forest', 'hill']
blacksmith.geography.getSceneContext(canvas.scene); // everything, including reputation
```

## Methods

| Method | Returns | Purpose |
|---|---|---|
| `get(scene?)` | `{realm, region, site, area}` | Resolved geography. With no scene, the campaign defaults. |
| `getSceneContext(scene?)` | object | Everything below, in one call. |
| `getHabitats(scene)` | `string[]` | Canonical habitat keys. |
| `getBreadcrumb(scene?)` | `string` | `"Faerun > Sword Coast > Baldur's Gate"`, empty segments skipped. |
| `set(scene, data)` | `Promise<boolean>` | Write any subset of the fields. GM only. |
| `clear(scene)` | `Promise<boolean>` | Remove the flag entirely. GM only. |
| `normalizeHabitats(value)` | `string[]` | Canonicalise a raw habitat array. |

`HABITATS` and `HABITAT_KEYS` are also exposed on `api.geography`.

`getSceneContext` returns exactly these keys: `realm`, `region`, `site`, `area`, `habitat`,
`reputation`, `locationUuid`.

## A scene's value wins; empty inherits

The four campaign settings (`defaultCampaignRealm` and its siblings) are the **seed** for a scene that
has not been told otherwise, not live state. Resolution is per field: a scene that sets only `realm`
inherits the other three.

An empty string means *inherit*, not *deliberately blank*. Clearing a field in the UI returns it to the
campaign default rather than storing an empty segment — the placeholder in the Geography tab shows which
default would apply.

## The habitat vocabulary

Twelve values, a closed constant rather than a registry, exposed as `{key, label}` pairs:

`mountain`, `arctic`, `planar`, `coastal`, `swamp`, `desert`, `underdark`, `forest`, `underwater`,
`grassland`, `urban`, `hill`.

**The key is what you store and join on. The label is what a person reads.** They are separate because a
value used as both an identity and a visible string cannot be made human-readable without breaking
whatever round-trips it.

**Normalise at your boundary rather than trusting the stored form.** `normalizeHabitats` accepts any
case, drops anything outside the vocabulary, collapses duplicates, and returns vocabulary order so two
scenes with the same habitats compare equal. Values written by a hand-edited flag or by an older
build are otherwise a silent join failure.

It also drops `null`, which matters more than it sounds. A checkbox group submits one entry per box with
`null` for each unticked one, and `String(null)` is `"null"` — truthy, so a `filter(Boolean)` normaliser
stores the literal string `"null"` once per box, producing data that looks populated and matches nothing.
See `documentation/api/api-scene-config.md` for the mechanism.

## Reputation: absent is not neutral

`reputation` is `-100..100`. A missing key means **never set** and reads as `null`; `0` means **neutral**.
These are different answers and an aggregate that treats them alike drags toward zero. Values outside the
scale are clamped on write.

## Writing

`set` takes any subset of the fields and merges. Everything is normalised on the way in, so a caller
cannot store an habitat outside the vocabulary or a reputation outside the scale.

```js
await blacksmith.geography.set(scene, { realm: 'Faerun', habitat: ['forest'] });
```

**The stored value is always canonical, whoever wrote it.** The Scene Config tab does not go through
`set` -- Foundry's form submission writes its inputs directly -- and a checkbox group submits one entry
per box with `null` for each unticked one. A `preUpdateScene` hook normalises the flag on its way onto
the document, so `habitat` never reaches the scene with nulls in it, the four fields are trimmed, and
reputation is clamped. That matters for anything reading the raw flag rather than going through this API:
a sibling module, a scene exported to a compendium, or a person looking at it in a console.

Both `set` and `clear` require GM and return `false` otherwise. The Geography tab in Scene Config does
not use them: its inputs are named `flags.coffee-pub-blacksmith.geography.<field>`, so Foundry's own form
submission persists them.
