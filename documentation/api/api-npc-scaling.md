# NPC Scaling API

**Audience:** developers of Coffee Pub modules that need to make a stronger or weaker copy of an NPC.

Scope: the public surface of `blacksmith.npcScaling` -- previewing and applying a scaling, reading what a
scaled actor says about itself, and the hook fired afterwards. How it works is in
`architecture/architecture-npc-scaling.md`.

```javascript
const scaling = game.modules.get('coffee-pub-blacksmith')?.api?.npcScaling;
```

Available from `ready`. **GM only, end to end:** scaling creates a world actor, so every call refuses with
`NOT_GM` for anyone else.

## What it does

Takes an NPC and a target challenge rating and makes a **new** actor: the same creature, with hit points,
armor class, attack bonus, spell save DC and damage raised (or lowered) by the difference between the two
challenge ratings in the CR guidelines. The source is never changed. A goblin becomes a "Goblin (Super)".

## `preview(target, request)`

What a scaling would change, writing nothing.

```javascript
const { spec, preview, warnings, snapshot } = await scaling.preview(token, { cr: 12, label: 'Super' });
```

`target` is an Actor, a Token, a TokenDocument or a UUID string. A token is read through its own actor, so an
unlinked token's changes count.

| Request field | Meaning |
|---|---|
| `cr` | Target challenge rating, a number: `0.125`, `0.25`, `0.5`, `1` to `30` |
| `template` | A saved template, by id (or the object), instead of `cr`. See Templates below |
| `spec` | A ready-made spec instead of `cr`; its `version` must be `scaling.SPEC_VERSION` |
| `label` | The name suffix: "Super" makes `Goblin (Super)`. With none the suffix is `CR 12` |
| `attacksPerRound` | Correct the attack count the creature makes now, which is otherwise read from its Multiattack where that says so plainly. An integer from 1 |
| `attacksTo` | Attacks per round to scale to, for a `cr` retarget. Default: what the new CR calls for (see below). Never fewer than the creature makes now |

Returns:

| Field | Meaning |
|---|---|
| `spec` | The spec that would be applied |
| `preview` | Rows `{ key, label, from, to, note }`, one per thing that changes: `cr`, `prof`, `hp`, `ac`, `attack`, `saveDC`, `init`, `damage`, `dpr`, `legres`, `legact`. `from` and `to` are `null` where only a total is known; `note` says what a person should know |
| `warnings` | `{ code, message }`. `DAMAGE_ON_ONE_ATTACK` when each hit would grow by more than three times the creature's own average hit: its attacks are too small to carry the CR |
| `snapshot` | What the creature is now: `cr`, `ac`, `hpMax`, `hpValue`, `attackBonus`, `saveDC`, `dpr`, `attacksPerRound`, `avgHit`. Damage figures are an estimate |

If the target already carries a scaling flag, the preview is of scaling its **source**, not the copy, so two
scalings never stack.

## `guidance(target, options)`

Which challenge rating to aim for, read from the scene the creature is in.

```javascript
const g = await scaling.guidance(token, { cr: 12, count: 1 });
// { available: true, onScene: true, partyCR: 10, othersCR: 4, count: 1,
//   now: { key: 'medium', label: 'Moderate', monsterCR: 9, ratio: 0.9 },
//   chosen: { cr: 12, key: 'deadly', label: 'Deadly', monsterCR: 16, ratio: 1.6 },
//   bands: [ { key: 'easy', label: 'Easy', from: 0, to: 0.5 }, { key: 'medium', label: 'Moderate', from: 1, to: 5 }, ... ] }
```

The party's rating and the other monsters' are the encounter figures Blacksmith's combat bar and the journal's
encounter toolbar use (`api.getPartyCR`), counting only what can still fight, and the bands are that same
difficulty rule, so the window never offers a rating the combat bar would call something else. Monster CR is a
**sum**, so the creature's own CR is added to the other monsters' at each step of the ladder; each band is the
run of ratings that lands the encounter on that difficulty, and `from` is the lowest that reaches it.

| Field | Meaning |
|---|---|
| `available` | `false` when the scene holds no player character to rate against. The rest is then empty |
| `onScene` | The target is a token (or an unlinked actor's sheet), so it was left out of the other monsters. A creature scaled from the sidebar is not subtracted |
| `partyCR`, `othersCR` | The two figures, as the encounter bar reads them. Rounded to whole numbers once summed |
| `now` | `{ key, label, monsterCR }`: the encounter as it stands, with the creature at its own CR. When it is not on the scene, the scene without it. `monsterCR` is the monsters' combined CR |
| `count` | How many of the creature the encounter holds at the chosen rating, from `options.count`: an integer from 1 to 20, default 1. Monster CR is the others plus `count` times the rating; `bands` and `chosen` are for that many, `now` is not |
| `chosen` | `{ cr, key, label, monsterCR, ratio }` for `options.cr`, when given: the same figures with `count` of the creature at that CR. `ratio` is monster CR over party CR |
| `zones`, `maxRatio` | The difficulty rule laid along one axis for a meter: `{ key, label, from, to }` runs of the **ratio** of monster CR to party CR, from 0 to `maxRatio` (2.5). Found by asking the rule, so they hold no thresholds of their own and do not depend on the creature |
| `bands` | `{ key, label, from, to }`, in order of rising difficulty. `key` is the encounter's difficulty class (`trivial`, `easy`, `medium`, `hard`, `deadly`, `impossible`) |

It is advice and changes nothing; `preview` and `apply` never read it. Refuses like `preview`: `NOT_GM`,
`NO_TARGET`, `NOT_NPC`.

## `apply(target, request)`

Creates the scaled actor. Takes the same request, plus `output`: `'actor'` (the default) or `'token'`, which
scales a token instead (see Scaling a token).

```javascript
const { actor, source, preview, warnings, spec, multiattack } = await scaling.apply(token, { cr: 12, label: 'Super' });
```

The new actor is a copy of the creature as it stands, with only the scaled fields and the creature's own
attacks changed (see Damage and attacks), current hit points set to the new maximum, and a provenance flag. It sits in the source's folder (none, for a source in
a compendium). Armor class becomes a fixed value that no longer follows equipment; only spell save DCs are
scaled, not a feature's own fixed DC.

## Damage and attacks

Damage is written **into the creature's own actions**, not held as a hidden bonus. Each damage part of a
non-spell attack, save or damage activity grows by the same ratio (a bite and a claw grow together, and a
breath weapon with them), in whole dice of the part's own die first and the remainder in the flat bonus:
`1d8 + 3` becomes `3d8 + 3`, and a bite of flat 1 is given d6s. A custom formula that starts with dice
grows its dice; one that does not has the amount appended. Spell damage is left to the spells. Where there is
nothing to measure against or write to (a creature with no attack damage), the amount is written as the
actor-level damage bonus instead, and the preview row says so.

A retarget **up** also gives the creature more attacks, because thirty damage on one hit is not the same
creature as three hits of ten: one below CR 3, two below CR 8, three below CR 16, four above, and never fewer
than it makes now. The per-hit amount is the new damage per round shared across them. When the count
rises, the new actor's **Multiattack** says so: an existing Multiattack feature has a paragraph appended
(its own text is kept, because it names which attacks go in which order); with none, the SRD's Multiattack
feature is looked up through the feature compendiums the GM has chosen (`api.compendiums`) and used as the
base of a new one, and with none of those a plain feature is made. `apply` resolves `multiattack`:
`'added'`, `'extended'`, or `null` when the count did not rise.

Templates carry a damage-per-hit amount, which is written the same way; they do not change the attack
count.

## Scaling a token

`output: 'token'` scales the creature a token stands for, so the one on the scene becomes the stronger one.

```javascript
const { token, actor, mode } = await scaling.apply(token, { cr: 12, label: 'Super', output: 'token' });
await scaling.revert(token);                         // put it back
scaling.tokenProvenance(token);                      // null, or what was done to it
const { results, failures } = await scaling.applyToTokens(tokens, { cr: 12 });
```

| The token is | What happens | `mode` |
|---|---|---|
| **Unlinked** | Its own actor is changed in place (an ActorDelta). Nothing is created. The token is renamed `Name (Label)`. Hit points, the creature's attacks and a Multiattack are written as for a new actor | `'delta'` |
| **Linked** | Its actor is shared with every token of it, so it is not changed. A new scaled actor is made and the token is pointed at it | `'swap'` |

The token carries one flag, `npcScalingToken`, written once and before anything it describes. For an in-place
scaling it holds the original of every value that was changed, so `revert` writes them back (and removes a
Multiattack it added); for a swap it holds the original actor id. A token that is already scaled refuses another
scaling (`ALREADY_SCALED`): revert first, so scalings never stack. `revert` of a swap points the token back
and **leaves the scaled actor in the directory**. An unlinked token whose actor is already a scaled copy is
refused, as is an actor that is not a token (`NO_TOKEN`).

`applyToTokens` plans the same request against each token's own creature, so a CR target moves a goblin and an
ogre by different amounts. A token that cannot be scaled lands in `failures` and does not stop the rest.

## Templates

A template is a named scaling with its numbers written in: "Elite", "Super". It names no document, so it
exports and imports as plain JSON. `scaling.templates` is the library, stored in the world; reads are open to
every client and writes are GM only.

```javascript
const [elite] = scaling.templates.list();
const { actor } = await scaling.apply(token, { template: elite.id });
```

A template is data, the numbers a table would say aloud:

| Field | Meaning |
|---|---|
| `id` | Opaque and stable. A template saved without one gets one |
| `name` | Up to 40 characters. It is also the name suffix: `Goblin (Elite)` |
| `crBy` | Whole steps up (or down) from the creature's own CR. Above CR 1 the step is exact; below it the result snaps to a CR with a row. `0` leaves CR alone |
| `hp` | `{ mode: 'percent' \| 'delta', value }`. A percentage is of the creature's own maximum, so a template means the same on a goblin and a dragon |
| `ac`, `initiative` | Added |
| `attack`, `saveDC` | The **total** change on the sheet, proficiency included. The proficiency change a `crBy` step causes is taken out before writing, as a CR retarget does |
| `damage` | Added to every weapon and spell attack |
| `legres`, `legact` | Sets the count. `0` leaves it alone |

Every number is a whole number and is clamped to a sane range on the way in.

| Member | Meaning |
|---|---|
| `list()` | Every template. The four built-ins (Weakened, Elite, Champion, Super) until the GM first changes the library |
| `get(id)` | One template, or `null` |
| `save(template)` | Add, or replace the one with this id. Resolves the stored template. `BAD_TEMPLATE` for no name |
| `remove(id)` | Delete one |
| `nameTaken(name, exceptId)` | Whether another template has this name, ignoring case |
| `fromSpec(spec, source, name)` | The portable template a spec amounts to, from a spec and the `{ cr, hpMax }` it was made for |
| `toSpec(template, source)` | The spec a template makes for a creature with this CR. Reads no actor |
| `exportPayload()` / `exportToFile()` | The library as an enveloped payload, or downloaded as a file |
| `parseImport(text)` | A file's text as templates, or `BAD_TEMPLATE`. Writes nothing |
| `import(templates, { replace })` | Merge by id (default) or replace. Resolves `{ added, updated, total }` |

The built-ins are a starting point, not a published rule: the numbers are this module's own, and a GM edits
or deletes them. They are planted once; a library a GM emptied stays empty.

## The guidelines table

A CR retarget moves each stat by the gap between two rows of a table. The module ships the DMG 2014 table. The
2024 books publish no equivalent, so a world can instead build one from the creatures in any actor
compendium: per challenge rating, the **median** armor class, hit points, best attack bonus, damage per round
and save DC of the NPCs there. A creature counts for a figure only when it has one (no attack, no attack
bonus). A CR with fewer than `minSamples` creatures (default 2) is interpolated between its neighbours, and
the columns are smoothed so none falls as CR rises; the result reports which rows were estimated or smoothed.

```javascript
const built = await scaling.buildGuidelines({ packs: ['dnd5e.actors24'] });   // writes nothing
// built.table, built.report.rows: [{ key: '5', n: 11, status: 'sampled' | 'smoothed' | 'interpolated' }, ...]
await scaling.setGuidelines(built);                                          // GM only: the world uses it now
scaling.guidelineInfo();   // { kind: 'compendium', label, builtAt, samples, packs, rows }
await scaling.resetGuidelines();                                             // back to DMG 2014
```

| Member | Meaning |
|---|---|
| `guidelines` | The table scaling reads now, frozen: bundled, or built |
| `bundledGuidelines` | The DMG 2014 table, frozen, whatever the world uses |
| `guidelineInfo()` | `{ kind: 'bundled' | 'compendium', label, builtAt, samples, packs, rows }` |
| `buildGuidelines({ packs, minSamples, onProgress })` | Read the NPCs in these compendium ids and build a table. Loads the documents, so a few hundred creatures take seconds; `onProgress(done, total)` reports. Resolves `{ table, report, label, packs, skipped }` |
| `setGuidelines(result)` | Make a built table the world's. `BAD_TABLE` for one whose rows fall or are missing |
| `resetGuidelines()` | Use the bundled table again |

A stored table that fails validation is not used; scaling falls back to the bundled one and logs it.
Templates do not read the table: their numbers are written in.

## `provenance(actor)`

```javascript
scaling.provenance(actor);
// { sourceUuid, spec, template, version, appliedAt, crFrom, crTo }, or null for any other actor
```

`template` is the template id when one made it, otherwise `null`.

## Errors

Every refusal is an `NpcScalingError` (`scaling.NpcScalingError`), with a stable `code`:

| `code` | When |
|---|---|
| `NOT_GM` | The caller is not a GM |
| `NO_TARGET` | The target is not, or does not resolve to, an actor |
| `NOT_NPC` | The target is not an NPC |
| `NO_CR` | The creature has no challenge rating to scale from |
| `INVALID_CR` | The target CR has no row in the guidelines (0 to 30, and 1/8, 1/4, 1/2) |
| `BAD_SPEC` | No `cr`, `template` or `spec`, an unknown spec version, or a malformed spec |
| `BAD_TEMPLATE` | A template that does not exist, has no name, or an import file that is not a template library |
| `NO_PATH` | The actor has nowhere to write a change the spec asks for |
| `UNSUPPORTED_OUTPUT` | `output` is neither `'actor'` nor `'token'` |
| `NO_TOKEN` | `output: 'token'` (or `revert`) was given an actor that is not a token |
| `ALREADY_SCALED` | The token is already scaled (revert it first), or is an unlinked token whose actor is already a scaled copy |
| `NOT_SCALED` | `revert` was given a token that is not scaled |
| `CREATE_FAILED` | Foundry did not create the actor |
| `NO_PACK` | `buildGuidelines` was given no actor compendium that exists |
| `BAD_TABLE` | No creature gave a usable figure for a column, or `setGuidelines` was given a table whose rows are missing or fall |

## `open(target)`

Opens the scaling window for a creature, or focuses the one already open for it. Resolves the window, or
`null` when there is no target or the user is not a GM.

## The hook

```javascript
Hooks.on('blacksmith.npcScaling.applied', ({ source, result, spec, output, token }) => { /* ... */ });   // output is 'actor' or 'token'; token is set for 'token'
Hooks.on('blacksmith.npcScaling.reverted', ({ token, mode, sourceUuid }) => { /* ... */ });
```

Fired once on the GM's client after the new actor exists. `source` is the Actor it was scaled from, `result`
the new Actor. Also available as `scaling.HOOK_APPLIED`.

## Smaller pieces

| Member | Meaning |
|---|---|
| `specFromCR(source, targetCR, { label })` | A CR retarget as a spec, from a snapshot you supply, reading no actor |
| `proficiencyForCR(cr)` | The proficiency bonus dnd5e gives an NPC of this CR |
| `SPEC_VERSION` | The spec version this build reads |

## What this does not do

It does not edit the source, rewrite spell damage, scale fixed save DCs on features, or scale an unlinked
token in place. Armor class behaves as described above.
