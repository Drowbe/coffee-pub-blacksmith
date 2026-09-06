# Telling One Monster From Another

**Audience:** anyone in the suite resolving, comparing, naming, or writing to an actor.

Practical knowledge about Foundry v13 unlinked tokens. Verified core-only.

**Read this before writing any line that identifies a creature.** Three modules got the same
thing wrong within two days -- Blacksmith, Bibliosoph and Squire, independently, in code that
had worked for months. Once each looked, it was **ten sites**: two in Blacksmith, two in
Bibliosoph, seven in Squire. One was reported by a user; the other nine were found only by
knowing what to grep for.

It is not an obscure edge. It is what happens the first time a GM fields more than one of
something, which is the first session of most campaigns. And it survives review because
`currentActor?.id === actor?.id` **looks** exactly like an identity check.

---

## 1. The rule

> **Resolve by token to identify or apply. By actor only to aggregate.**
>
> **`actor.id` is an aggregate identity. `actor.uuid` is a specific one.**

Comparing with `.id` asks *"the same KIND of creature?"*. Comparing with `.uuid` asks *"the
same creature?"*. Most code means the second and writes the first.

---

## 2. Why, in one paragraph

The ordinary way to field a group is to drop one monster on the canvas and copy-paste it --
nineteen cultists from one actor. Every copy is **unlinked**: it carries its own ActorDelta,
so it has its own hit points, its own effects, and its own name on the nameplate. Foundry
builds a synthetic actor per token from base + delta, and that object is genuinely distinct.

But it reports the **base actor's id**:

    token.document.actorLink   false
    token.actor.uuid           Scene.rSvj….Token.7s08….Actor.k2wg…   <- distinct per token
    token.actor.uuid           Scene.rSvj….Token.Acwj….Actor.k2wg…   <- distinct per token
    token.actor.id             k2wgXXD2aQU5co4F                      <- SHARED by all copies
    token.actor.name           "Bandit"    <- the PROTOTYPE's name, shared by all copies
    token.name                 "Tusk" / "Patch"  <- what the GM sees and means

**A delta does not override `name`.** This is the detail that catches people: the tokens are
visibly named, the actor behind each is genuinely separate, and `actor.name` still returns the
prototype's name for all of them.

---

## 3. What to use

| You want | Use | Not |
|---|---|---|
| Is this the same creature? | `actor.uuid`, or `token.id` | `actor.id` |
| Apply damage, an effect, a condition | the token's actor -- `canvas.tokens.get(tokenId)?.actor`, or `fromUuid(targetUuid)` | `game.actors.get(actorId)` |
| Name it for a human | `token.name` | `actor.name` |
| Its current hit points, AC, effects | the token's actor | the base actor |
| Count kills per monster type, aggregate statistics | `actor.id` -- correct here | |
| Compare against a **directory** actor -- `user.character`, an assigned PC, anything that is always linked | `actor.id` -- correct here, and `.uuid` would be noise | |

**Do not sweep `.id` to `.uuid` blindly.** The second row above is real: a user's assigned
character is always a directory-linked actor, so `.id` is exact for it and changing it gains
nothing while making the comparison harder to read. The question is never "is this `.id`" but
"can the thing on either side of this ever be an unlinked token's actor?"

Resolve token-first with the actor as fallback, never the reverse:

```js
const actor = canvas?.tokens?.get(data.tokenId ?? '')?.actor
           ?? game.actors.get(data.actorId ?? '');
```

`fromUuid()` on a `Scene.X.Token.Y.Actor.Z` uuid returns that token's own delta actor, which
is what anything applied should be written to.

---

## 4. What it looks like when you get it wrong

None of these throws. All four shipped.

| Symptom | Cause |
|---|---|
| Every hit and MVP line names the same creature, so damage spread across a group reads as damage landing repeatedly on one | named from `actor.name` |
| A card shows a damage number that does not match the token it is about | percentage computed from the **prototype's** max HP |
| A toast names a creature that was not involved | `actor.getActiveTokens()[0]` -- an arbitrary copy |
| Selecting a different copy does nothing; the panel refuses to switch | `currentActor?.id === actor?.id` reading "unchanged" |

**The first one is the dangerous one**, and not because it is the worst bug. It is the one
that makes a GM report something else entirely. A display that calls nineteen creatures by one
name looks exactly like damage being applied to all of them at once, and the resulting hunt
goes looking for a data bug that does not exist. Confirm what actually moved before believing
what it looked like.

**A diagnostic worth keeping**, from the Squire instance: two independent entry points failed
together -- selecting a token on the canvas, and clicking one in the Party tab. Neither entry
point was broken. The Party tab already keyed on `token.id` and selected the right token; both
paths then met one `.id` comparison downstream. **When two independent entry points fail the
same way, the shared thing downstream is the candidate**, and fixing either entry point is
wasted work.

---

## 5. Checking your own module

```
grep -rn "\.id === .*\.id\|actor\?\.id ===" scripts/
grep -rn "game\.actors\.get(" scripts/
```

For each hit, ask: **identify, apply, or aggregate?** The first two are wrong here and the
third is right, and the answer is usually obvious once the question is asked. That it is
obvious in review and invisible while writing is exactly why this page exists.

A quick live check, with two copies of one monster on the canvas:

```js
canvas.tokens.placeables
  .filter(t => t.document.actorId === '<base actor id>')
  .map(t => ({ name: t.name, uuid: t.actor?.uuid, id: t.actor?.id,
               hp: t.actor?.system?.attributes?.hp?.value }));
```

Distinct `uuid`, identical `id`, and `name` that differs from `actor.name` -- that is the
shape everything above follows from.
