# Party API

**Audience:** developers of Coffee Pub modules that need to know who the party is.

Scope: the public surface of `blacksmith.party` - the two rosters, the primary party actor, and which
question each answers.

## Two answers, because there are two questions

"Who counts as the party" has two forms, and they give different lists. Modules answering it separately were
picking one without noticing the other existed.

```js
blacksmith.party.resting();   // who can rest
blacksmith.party.acting();    // who can act on their own behalf
```

`resting()` returns the party's **creatures** (`system.creatures`). That includes NPC members - a familiar,
a companion, a hired hand travelling with the group - because they rest with the group, and it is precisely
who dnd5e offers on its own party rest. It excludes the party actor itself, since a group is not a creature.

`acting()` returns the party's **player characters** (`system.playerCharacters`), which filters on
`system.isCharacter` and therefore drops those NPC members. Use it for anything a member does as an agent:
shopping, spending, voting, being offered a choice.

The difference is not cosmetic. A familiar rests with the party and cannot buy a sword. Reaching for the
wrong one gives a roster that looks right in testing and is wrong at a table with a druid in it.

## The fallback

Both fall back to every **player-owned** actor passing the same test when no primary party is set, so a
world that has not curated one still gets a usable roster rather than an empty window.

That fallback is the part every consumer reinvents slightly differently, which is most of why this exists.

```js
blacksmith.party.hasPrimaryParty();   // false when the rosters came from the fallback
```

Worth surfacing in a GM-facing window: "no primary party set" explains an odd roster better than the roster
does.

## The party actor

```js
blacksmith.party.actor();   // the primary party Actor, or null
```

Null is normal, not an error - it is what `hasPrimaryParty()` is reporting on.

## What this does not do

It returns facts, not decisions. It does not filter by ownership, by who is online, by permission, or by
anything domain-specific, and it takes no options to do so - a consumer that needs "party members this user
owns" composes that itself from `acting()`.

That split is deliberate: the fact belongs here, the behaviour belongs to the module that has the rules.
Adding a `getParty({ mine: true })` would put us in the business of guessing which of several plausible
filters a caller meant.
