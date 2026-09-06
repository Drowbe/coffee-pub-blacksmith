# Equip Locations: verification owed

`api.equipLocations` shipped with `tools/check-equip-locations.mjs` covering the taxonomy, the
vocabulary order, the twelve weapons read from the dnd5e 5.3.3 packs, both `system.properties` shapes,
and the refusal cases. That check runs in bare Node against the real modules, so what remains is only
what Node cannot see: the API actually reaching consumers inside Foundry, and real world content.

Delete each item when it passes. Passing means delete, not tick.

## 1. The API is reachable

Paste into a script macro:

```js
const api = game.modules.get('coffee-pub-blacksmith')?.api?.equipLocations;
console.log(api ? 'present' : 'MISSING', Object.values(api?.LOCATIONS ?? {}).length, 'locations');
```

Expect `present 13`. A `MISSING` means the wiring in `blacksmith.js` did not take, not that the
classifier is wrong.

## 2. Real items from a real actor

Run against a character with a full inventory, ideally the one whose import put arrows on a head:

```js
const api = game.modules.get('coffee-pub-blacksmith').api.equipLocations;
const actor = game.actors.getName('PUT A NAME HERE');
console.table(actor.items.map(i => ({
    name: i.name, type: i.type,
    ...api.resolve(i)
})));
```

Check three things, in this order:

- **Nothing is placed that should not be.** Every row with a `location` should be defensible. A wrong
  confident answer is the failure this API exists to prevent; an unplaced item is not a failure.
- **Ammunition is `ammunition`, never a body location.** This is the original defect.
- **`source` is honest.** A row reading `structured` should be one dnd5e genuinely knows; a row reading
  `vocabulary` should be one where only the name gave it away.

Record any item that resolved to a location a person would not have chosen, with its `matched` value.
That names the rule that fired, which is the whole point of the field.

## 3. Both property shapes in the live world

Item 4 of the check covers this synthetically. The live version matters because it is the path that
differs: pack data gives `system.properties` as an array, a prepared document gives a Set.

```js
const api = game.modules.get('coffee-pub-blacksmith').api.equipLocations;
const pack = game.packs.get('dnd5e.items') ?? game.packs.get('dnd5e.equipment24');
const fromPack = (await pack.getDocuments()).find(i => i.name === 'Greatsword');
const onActor = game.actors.contents.flatMap(a => a.items.contents).find(i => i.name === 'Greatsword');
console.log('pack:', api.resolve(fromPack), '\nactor:', api.resolve(onActor));
```

Both must report `held`, `both`, 2. If one reports `main`/1, the property read is seeing only one
shape.

## 4. Squire's map, end to end

Squire writes its slot map against this API and runs it over the sixteen items from the screenshot
that caught the original bug. Owed back from that run:

- Any location the taxonomy could not express.
- Anywhere Squire had to ignore `grip` and decide differently.
- Any item that resolved to `null` which a person would have placed confidently — those are candidate
  vocabulary additions, and the pattern goes in the built-in table rather than in Squire.

## 5. A world with homebrew or non-English content

`registerVocabulary()` with a `position` is the extension path, and it has only been exercised by the
check tool. Confirm in a real world that a registered pattern at position 0 wins over a built-in, and
that a pattern appended with no position does not fire when a built-in already matches — the second is
the failure mode the `position` argument exists to prevent, and it is silent.
