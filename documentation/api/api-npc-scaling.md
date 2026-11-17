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
| `spec` | A ready-made spec instead of `cr`; its `version` must be `scaling.SPEC_VERSION` |
| `label` | The name suffix: "Super" makes `Goblin (Super)`. With none the suffix is `CR 12` |
| `attacksPerRound` | Correct the attack count the damage bonus is spread across. An integer from 1 |

Returns:

| Field | Meaning |
|---|---|
| `spec` | The spec that would be applied |
| `preview` | Rows `{ key, label, from, to, note }`, one per thing that changes: `cr`, `prof`, `hp`, `ac`, `attack`, `saveDC`, `init`, `damage`, `dpr`, `legres`, `legact`. `from` and `to` are `null` where only a total is known; `note` says what a person should know |
| `warnings` | `{ code, message }`. `DAMAGE_ON_ONE_ATTACK` when the per-hit bonus is more than three times the creature's own average hit |
| `snapshot` | What the creature is now: `cr`, `ac`, `hpMax`, `hpValue`, `attackBonus`, `saveDC`, `dpr`, `attacksPerRound`, `avgHit`. Damage figures are an estimate |

If the target already carries a scaling flag, the preview is of scaling its **source**, not the copy, so two
scalings never stack.

## `apply(target, request)`

Creates the scaled actor. Takes the same request, plus `output`, which must be `'actor'` or omitted.

```javascript
const { actor, source, preview, warnings, spec } = await scaling.apply(token, { cr: 12, label: 'Super' });
```

The new actor is a copy of the creature as it stands, with only the scaled fields changed, current hit
points set to the new maximum, and a provenance flag. It sits in the source's folder (none, for a source in
a compendium). Armor class becomes a fixed value that no longer follows equipment; only spell save DCs are
scaled, not a feature's own fixed DC.

## `provenance(actor)`

```javascript
scaling.provenance(actor);
// { sourceUuid, spec, version, appliedAt, crFrom, crTo }, or null for any other actor
```

## Errors

Every refusal is an `NpcScalingError` (`scaling.NpcScalingError`), with a stable `code`:

| `code` | When |
|---|---|
| `NOT_GM` | The caller is not a GM |
| `NO_TARGET` | The target is not, or does not resolve to, an actor |
| `NOT_NPC` | The target is not an NPC |
| `NO_CR` | The creature has no challenge rating to scale from |
| `INVALID_CR` | The target CR has no row in the guidelines (0 to 30, and 1/8, 1/4, 1/2) |
| `BAD_SPEC` | No `cr` and no `spec`, an unknown spec version, or a malformed spec |
| `NO_PATH` | The actor has nowhere to write a change the spec asks for |
| `UNSUPPORTED_OUTPUT` | `output` is anything but `'actor'` |
| `CREATE_FAILED` | Foundry did not create the actor |

## `open(target)`

Opens the scaling window for a creature, or focuses the one already open for it. Resolves the window, or
`null` when there is no target or the user is not a GM.

## The hook

```javascript
Hooks.on('blacksmith.npcScaling.applied', ({ source, result, spec, output }) => { /* ... */ });
```

Fired once on the GM's client after the new actor exists. `source` is the Actor it was scaled from, `result`
the new Actor. Also available as `scaling.HOOK_APPLIED`.

## Smaller pieces

| Member | Meaning |
|---|---|
| `specFromCR(source, targetCR, { label })` | A CR retarget as a spec, from a snapshot you supply, reading no actor |
| `proficiencyForCR(cr)` | The proficiency bonus dnd5e gives an NPC of this CR |
| `guidelines` | The CR guidelines table, frozen |
| `SPEC_VERSION` | The spec version this build reads |

## What this does not do

It does not edit the source, add attacks, change items, or scale an unlinked token in place. Armor class and
fixed save DCs behave as described above.
